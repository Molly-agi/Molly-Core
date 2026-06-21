from http.server import BaseHTTPRequestHandler, HTTPServer

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        self.send_response(200)
        self.end_headers()
        print('Handshake received')

server = HTTPServer(('0.0.0.0', 8788), Handler)
print('Server started on 8788')
server.serve_forever()