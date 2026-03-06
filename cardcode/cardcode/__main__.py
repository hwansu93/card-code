import uvicorn


def main():
    uvicorn.run("cardcode.app:app", host="0.0.0.0", port=8420, reload=True)


if __name__ == "__main__":
    main()
