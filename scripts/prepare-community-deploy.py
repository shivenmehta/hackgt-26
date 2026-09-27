"""Stage only public Python code and the optional public SNAP snapshot for Vercel."""
from pathlib import Path
import shutil
root = Path(__file__).resolve().parents[1]
target = root / 'services/community/location'
target.mkdir(parents=True, exist_ok=True)
for source in (root / 'src/lib/location').glob('*.py'):
    shutil.copy2(source, target / source.name)
snap = root / 'test-results/snap-retailers.sqlite3'
if snap.exists():
    shutil.copy2(snap, root / 'services/community/snap-retailers.sqlite3')
print('Community Python source staged. No private local events or credentials copied.')
