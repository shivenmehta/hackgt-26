import hmac
import os
from fastapi import FastAPI, Header, HTTPException, Request
from ranker import rank

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

@app.post('/rank')
async def rank_recipes(request: Request, authorization: str = Header(default='')):
    token = os.environ.get('RANKER_SERVICE_TOKEN', '')
    if not token or not hmac.compare_digest(authorization, 'Bearer ' + token):
        raise HTTPException(status_code=401, detail='Unauthorized')
    body = await request.body()
    if len(body) > 1_000_000:
        raise HTTPException(status_code=413, detail='Request too large')
    try:
        import json
        return rank(json.loads(body))
    except (ValueError, TypeError, KeyError, AttributeError):
        raise HTTPException(status_code=422, detail='Invalid ranking request') from None
