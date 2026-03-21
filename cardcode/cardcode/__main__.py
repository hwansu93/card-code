import uvicorn
from cardcode.config import load_config


def main():
    config = load_config()
    uvicorn.run(
        "cardcode.app:app",
        host=config.host,
        port=config.port,
        reload=True,
    )


if __name__ == "__main__":
    main()
