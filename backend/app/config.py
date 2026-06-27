"""App configuration — reads from the root .env file."""

from pathlib import Path

from pydantic_settings import BaseSettings

# Root of the monorepo (hackthelaw/)
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = ROOT_DIR / ".env.development"


class Settings(BaseSettings):
    neo4j_uri: str
    neo4j_username: str = "neo4j"
    neo4j_password: str

    # Future phases
    anthropic_api_key: str = ""
    gcs_bucket: str = ""

    model_config = {"env_file": str(ENV_FILE), "env_file_encoding": "utf-8"}


settings = Settings()  # type: ignore[call-arg]
