"""Server-only PostgREST persistence for the hosted Community service."""
import json
import os
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError

def enabled():
    return os.environ.get('LOCATION_EVENTS_BACKEND') == 'supabase'

def request(path, *, method='GET', data=None, query=None):
    url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '').rstrip('/')
    key = os.environ.get('SUPABASE_SECRET_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        raise RuntimeError('Community storage is not configured.')
    headers = {'apikey': key, 'Content-Type': 'application/json', 'Prefer': 'return=representation'}
    if not key.startswith('sb_secret_'):
        headers['Authorization'] = 'Bearer ' + key
    endpoint = url + '/rest/v1/' + path
    if query: endpoint += '?' + urlencode(query)
    try:
        with urlopen(Request(endpoint, data=json.dumps(data, allow_nan=False).encode() if data is not None else None,
                             method=method, headers=headers), timeout=15) as response:
            return json.load(response)
    except HTTPError as error:
        if error.code == 400:
            raise ValueError('Invalid event submission or reused submission ID.') from None
        raise RuntimeError('Community storage is unavailable.') from None
    except (OSError, ValueError):
        raise RuntimeError('Community storage is unavailable.') from None

def create(event, start, end, token_hash, request_hash, body_hash):
    return request('rpc/bridge_create_event', method='POST', data=dict(
        p_id=event['place_id'],p_payload=event,p_starts=start,p_ends=end,
        p_token_hash=token_hash,p_request_hash=request_hash,p_body_hash=body_hash))

def get(event_id):
    rows=request('bridge_community_events',query={'id':'eq.'+event_id,'select':'payload,cancelled','limit':'1'})
    return (json.dumps(rows[0]['payload']), rows[0]['cancelled']) if rows else None

def cancel(event_id, token_hash):
    rows=request('bridge_community_events',method='PATCH',data={'cancelled':True},
                 query={'id':'eq.'+event_id,'token_hash':'eq.'+token_hash,'select':'id'})
    if not rows: raise ValueError('Event not found or edit token invalid.')

def search(current, until, instant):
    result=[]
    offset=0
    while True:
        rows=request('bridge_community_events',query={'cancelled':'eq.false','ends':'gt.'+str(current),
            'starts':('lte.' if instant else 'lt.')+str(until),'select':'payload','order':'id','limit':'1000','offset':str(offset)})
        result.extend((json.dumps(row['payload']),) for row in rows)
        if len(rows)<1000: return result
        offset+=len(rows)
