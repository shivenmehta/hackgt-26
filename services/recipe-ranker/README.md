# Bridge recipe ranker

Stateless Python service for recipe-level nearest-neighbor ranking. This is separate from the existing USDA ingredient matcher.

Local: `.venv/bin/python -m uvicorn app:app --app-dir services/recipe-ranker --host 127.0.0.1 --port 8767` with `RANKER_SERVICE_TOKEN` configured. The normal `npm run dev` launcher starts this automatically.

Deploy this directory as a Vercel FastAPI project. Configure the token in both projects and set the web project's `RANKER_SERVICE_URL` to this service's HTTPS origin. The service accepts only authenticated `POST /rank`; it does not hold database or model-provider credentials.

Run `python3 -m unittest discover -s services/recipe-ranker -p 'test_*.py' -v` from the repository root. See `docs/MEAL_PLANNER.md` for the complete contract and deployment instructions.
