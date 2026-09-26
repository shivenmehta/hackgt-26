from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from http.server import ThreadingHTTPServer
import uuid

from src.lib.location import service
from src.lib.location.events import create_event, get_event, cancel_event


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.db = Path(self.directory.name) / 'events.sqlite3'
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), service.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.close)
        for name, value in [('DB', self.db), ('TOKEN', 'test-private-service-token' * 2)]:
            context = patch.object(service, name, value)
            context.start()
            self.addCleanup(context.stop)
        for queue in service.REQUESTS.values():
            queue.clear()
        now = datetime.now(timezone.utc)
        self.event = {'host_name': 'Test host', 'message': 'Food to share', 'foods': ['Pasta'],
                      'address': 'Synthetic venue', 'latitude': 33.7756, 'longitude': -84.3963,
                      'starts_at': (now + timedelta(hours=1)).isoformat(),
                      'ends_at': (now + timedelta(hours=2)).isoformat(), 'public_location_confirmed': True}

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, path, body=None, authorized=True):
        request = Request(f'http://127.0.0.1:{self.server.server_port}{path}',
                          data=None if body is None else json.dumps(body).encode(),
                          headers={'Authorization': 'Bearer ' + service.TOKEN if authorized else '',
                                   'Content-Type': 'application/json'})
        try:
            with urlopen(request, timeout=10) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def test_create_retry_public_read_nearby_cancel(self):
        body = {'event': self.event, 'request_id': str(uuid.uuid4())}
        status, first = self.request('/events', body)
        self.assertEqual(status, 201)
        _, repeated = self.request('/events', body)
        self.assertEqual(repeated, first)
        identifier = first['event']['place_id']
        _, public = self.request('/events/' + identifier)
        self.assertNotIn(first['edit_token'], json.dumps(public))
        self.assertEqual(public['event']['status'], 'upcoming')
        _, result = self.request('/nearby?lat=33.7756&lon=-84.3963&sources=events')
        self.assertEqual(len(result['locations']), 1)
        self.assertEqual(self.request('/events/' + identifier + '/cancel', {'edit_token': 'wrong'})[0], 400)
        self.assertEqual(self.request('/events/' + identifier + '/cancel', {'edit_token': first['edit_token']})[0], 200)
        self.assertEqual(self.request('/events/' + identifier)[1]['event']['status'], 'cancelled')
        self.assertEqual(self.request('/nearby?lat=33.7756&lon=-84.3963&sources=events')[1]['locations'], [])

    def test_conflicting_retry_and_public_expired(self):
        request_id = str(uuid.uuid4())
        first = create_event(self.event, db_path=self.db, request_id=request_id)
        with self.assertRaises(ValueError):
            create_event({**self.event, 'message': 'different'}, db_path=self.db, request_id=request_id)
        expired = get_event(first['event']['place_id'], db_path=self.db, now=self.event['ends_at'])
        self.assertEqual(expired['status'], 'ended')
        self.assertIsNone(get_event('missing', db_path=self.db))

    def test_auth_input_limits_and_rate_limit(self):
        self.assertEqual(self.request('/health', authorized=False)[0], 401)
        self.assertEqual(self.request('/events', {'big': 'a' * 21000})[0], 413)
        self.assertEqual(self.request('/events', [1, 2])[0], 400)
        self.assertEqual(self.request('/nearby?lat=nan&lon=1')[0], 400)
        with patch.object(service, 'limited', return_value=True):
            self.assertEqual(self.request('/health')[0], 429)

    def test_partial_sources_preserve_event(self):
        create_event(self.event, db_path=self.db)
        original = service.search_sources
        def partial(lat, lon, radius, **options):
            if options['sources'] == ['osm']:
                raise RuntimeError('internal path should never be public')
            return original(lat, lon, radius, **options)
        with patch.object(service, 'search_sources', side_effect=partial):
            _, result = self.request('/nearby?lat=33.7756&lon=-84.3963&sources=osm,events')
        self.assertEqual(len(result['locations']), 1)
        self.assertTrue(result['partial_results'])
        self.assertNotIn('internal path', json.dumps(result))


if __name__ == '__main__':
    unittest.main()
