"""Local UI acceptance server: isolated database, no MAX transport or secrets."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import uvicorn
from app.config import Settings
from app.main import create_app

if __name__ == '__main__':
    uvicorn.run(create_app(Settings(
        _env_file=None, database_path='.local/ryadom-ui-acceptance.sqlite3',
        demo_mode=True, bot_transport='disabled', max_bot_token='',
        public_base_url='http://127.0.0.1:8010',
    )), host='127.0.0.1', port=8010)
