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

    # Supabase
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_secret_key: str = ""
    supabase_jwt_secret: str = ""

    # "ignore" rather than the pydantic-settings default of "forbid" — this env
    # file is shared with the Next.js frontend, which has its own keys
    # (PERPLEXITY_API_KEY, etc.) that aren't this app's concern.
    model_config = {"env_file": str(ENV_FILE), "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()  # type: ignore[call-arg]
