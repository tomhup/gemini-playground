from OpenSSL import crypto
from datetime import datetime, timedelta

def create_self_signed_cert():
    # 生成密钥
    k = crypto.PKey()
    k.generate_key(crypto.TYPE_RSA, 2048)

    # 创建证书
    cert = crypto.X509()
    cert.get_subject().CN = "192.168.0.100"
    cert.set_serial_number(1000)
    cert.gmtime_adj_notBefore(0)
    cert.gmtime_adj_notAfter(365*24*60*60)  # 有效期一年
    cert.set_issuer(cert.get_subject())
    cert.set_pubkey(k)

    # 添加 Subject Alternative Name 扩展
    alt_names = [
        b"DNS:localhost",
        b"IP:127.0.0.1",
        b"IP:192.168.0.100"  # 添加你的本地IP
    ]
    san_extension = crypto.X509Extension(
        b"subjectAltName",
        False,
        b", ".join(alt_names)
    )
    cert.add_extensions([san_extension])

    cert.sign(k, 'sha256')

    # 写入文件
    with open("cert.pem", "wb") as f:
        f.write(crypto.dump_certificate(crypto.FILETYPE_PEM, cert))
    with open("key.pem", "wb") as f:
        f.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, k))

if __name__ == '__main__':
    create_self_signed_cert()
    print("Certificate and key files have been generated")