import asyncio

async def handle_client(reader, writer):
    try:
        data = await reader.read(1024)
        # Acknowledge handshake
        writer.write(b'HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n')
        await writer.drain()
    except Exception as e:
        pass
    finally:
        writer.close()
        await writer.wait_closed()

async def main():
    server = await asyncio.start_server(handle_client, '127.0.0.1', 8787)
    async with server:
        await server.serve_forever()

if __name__ == '__main__':
    asyncio.run(main())
