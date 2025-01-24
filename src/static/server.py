import http.server
import socketserver
import ssl
import socket

class MyHttpRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.endswith('.js'):
            self.send_response(200)
            self.send_header('Content-type', 'application/javascript')
            self.end_headers()
            with open('.' + self.path, 'rb') as file:
                self.wfile.write(file.read())
        else:
            return http.server.SimpleHTTPRequestHandler.do_GET(self)

    def end_headers(self):
        # 添加 CORS 头
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

# 使用 0.0.0.0 允许外部访问
HOST = "0.0.0.0"
PORT = 8000
Handler = MyHttpRequestHandler

# 创建 HTTPS 服务器
httpd = socketserver.TCPServer((HOST, PORT), Handler)

# 配置 SSL
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(certfile='cert.pem', keyfile='key.pem')
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

print(f"Serving HTTPS on {HOST}:{PORT}")
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\nShutting down server")
    httpd.server_close()