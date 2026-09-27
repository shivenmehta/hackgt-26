import json
import os
import unittest
from unittest.mock import patch
from src.lib.location import hosted_events

class HostedEventTests(unittest.TestCase):
    def test_create_uses_atomic_rpc(self):
        with patch.object(hosted_events,'request',return_value={'place_id':'event'}) as call:
            result=hosted_events.create({'place_id':'event'},1,2,'hash','request','body')
            self.assertEqual(result['place_id'],'event')
            self.assertEqual(call.call_args.args[0],'rpc/bridge_create_event')
            self.assertEqual(call.call_args.kwargs['data']['p_request_hash'],'request')
    def test_public_get_does_not_request_token(self):
        with patch.object(hosted_events,'request',return_value=[{'payload':{'place_id':'event'},'cancelled':False}]) as call:
            row=hosted_events.get('event')
            self.assertEqual(json.loads(row[0]),{'place_id':'event'})
            self.assertEqual(call.call_args.kwargs['query']['select'],'payload,cancelled')
    def test_cancel_requires_matching_capability(self):
        with patch.object(hosted_events,'request',return_value=[]) as call:
            with self.assertRaises(ValueError): hosted_events.cancel('event','wrong')
            self.assertEqual(call.call_args.kwargs['query']['token_hash'],'eq.wrong')
    def test_search_paginates(self):
        with patch.object(hosted_events,'request',side_effect=[[{'payload':{'id':i}} for i in range(1000)],[]]) as call:
            self.assertEqual(len(hosted_events.search(1,2,False)),1000)
            self.assertEqual(call.call_args.kwargs['query']['offset'],'1000')
