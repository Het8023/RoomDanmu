#!/usr/bin/env python
# Compatible with CentOS 7 Python 2.7 and Python 3; no packages required.
# Guest: python vm-lan-peer.py [host-ip] [room-code] [--direct-only]
from __future__ import print_function
import json
import socket
import sys
import time
import uuid

PORT = 47779

def main():
    host = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else None
    room = sys.argv[2] if len(sys.argv) > 2 else 'VMTEST'
    direct_only = '--direct-only' in sys.argv
    identity = 'VM-' + uuid.uuid4().hex
    guest_token = uuid.uuid4().hex
    peers = set()
    incoming_probe = False
    outgoing_ack = False
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    sock.bind(('0.0.0.0', PORT))
    sock.settimeout(0.5)

    def log(event, **details):
        details['event'] = event
        print(json.dumps(details))
        sys.stdout.flush()

    def send(kind, address, text=None):
        message = {'t': kind, 'id': identity, 'room': room, 'name': 'CentOS-Test'}
        if text is not None:
            message.update(text=text, ts=int(time.time() * 1000))
        sock.sendto(json.dumps(message).encode('utf-8'), address)

    log('starting', room=room, port=PORT, host=host, direct_only=direct_only)
    deadline = time.time() + 50
    next_hello = 0
    try:
        while time.time() < deadline:
            if time.time() >= next_hello:
                targets = set(peers)
                if not direct_only:
                    targets.add(('255.255.255.255', PORT))
                if host:
                    targets.add((host, PORT))
                for address in targets:
                    send('hello', address)
                next_hello = time.time() + 4
            try:
                raw, address = sock.recvfrom(65535)
            except socket.timeout:
                continue
            try:
                message = json.loads(raw.decode('utf-8'))
            except (ValueError, UnicodeError):
                continue
            if not isinstance(message, dict) or message.get('id') == identity or message.get('room') != room:
                continue
            log('received', sender=address, message=message)
            if message.get('t') == 'hello':
                if address not in peers:
                    peers.add(address)
                    send('hello', address)
                    send('dm', address, 'guest-probe:' + guest_token)
            elif message.get('t') == 'dm':
                text = message.get('text', '')
                if text.startswith('host-probe:'):
                    incoming_probe = True
                    send('dm', address, 'guest-ack:' + text[len('host-probe:'):])
                    send('dm', address, 'guest-probe:' + guest_token)
                elif text == 'host-ack:' + guest_token:
                    outgoing_ack = True
            if incoming_probe and outgoing_ack:
                log('PASS', host_to_guest=True, guest_to_host=True)
                return 0
        log('FAIL', host_to_guest=incoming_probe, guest_to_host=outgoing_ack)
        return 1
    finally:
        sock.close()

if __name__ == '__main__':
    sys.exit(main())
