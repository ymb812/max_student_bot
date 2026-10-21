"""Local UI acceptance server: isolated database, no MAX transport or secrets."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import uvicorn
from app.config import Settings
from app.main import create_app

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8010)
    parser.add_argument('--database', default='.local/ryadom-ui-acceptance.sqlite3')
    args = parser.parse_args()
    uvicorn.run(create_app(Settings(
        _env_file=None, database_path=args.database,
        demo_mode=True, bot_transport='disabled', max_bot_token='',
        editor_sutd_key='local-ui-sutd', editor_leti_key='local-ui-leti',
        public_base_url=f'http://127.0.0.1:{args.port}',
    )), host='127.0.0.1', port=args.port)
