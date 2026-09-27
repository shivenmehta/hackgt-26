"""Authenticated serverless adapter for Bridge Community."""
import hmac
import os
import sqlite3
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from location.events import create_event, cancel_event, get_event, geocode_address
from location.autocomplete import suggest_addresses
from location.service import nearby, limited

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

@app.api_route('/{path:path}', methods=['GET', 'POST'])
async def route(path: str, request: Request):
    token = os.environ.get('LOCATION_SERVICE_TOKEN', '')
    if not token or not hmac.compare_digest(request.headers.get('authorization', ''), 'Bearer ' + token):
        return JSONResponse({'error': 'Unauthorized service request.'}, status_code=401)
    if limited('write' if request.method == 'POST' and path != 'suggest' else 'read'):
        return JSONResponse({'error': 'Too many requests. Please retry shortly.'}, status_code=429)
    body = {}
    if request.method == 'POST':
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > 20000:
                return JSONResponse({'error': 'Post is too large.'}, status_code=413)
        try:
            import json
            body = json.loads(raw)
            if not isinstance(body, dict):
                raise ValueError()
        except ValueError:
            return JSONResponse({'error': 'Expected a JSON object.'}, status_code=400)
    def dispatch():
        if request.method == 'GET':
            if path == 'health': return 200, {'status': 'ok'}
            if path == 'nearby': return 200, nearby(dict(request.query_params))
            if path.startswith('events/') and '/' not in path[7:]:
                event = get_event(path[7:])
                return (200, {'event': event}) if event else (404, {'error': 'Event not found.'})
        else:
            if path == 'suggest': return 200, {'candidates': suggest_addresses(body.get('query'))}
            if path == 'geocode': return 200, {'candidates': geocode_address(body.get('address'))}
            if path == 'events': return 201, create_event(body.get('event'), request_id=body.get('request_id'))
            if path.startswith('events/') and path.endswith('/cancel'):
                cancel_event(path[7:-7], body.get('edit_token'))
                return 200, {'cancelled': True}
        return 404, {'error': 'Not found.'}
    try:
        status, data = await run_in_threadpool(dispatch)
    except (ValueError, TypeError):
        status, data = 400, {'error': 'Invalid request fields or event details.'}
    except (RuntimeError, OSError, sqlite3.Error):
        status, data = 503, {'error': 'Food service unavailable. Please retry shortly.'}
    return JSONResponse(data, status_code=status, headers={'Cache-Control': 'no-store'})
