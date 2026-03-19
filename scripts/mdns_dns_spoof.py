#!/usr/bin/env python3
"""
mdns_dns_spoof.py — Captive Portal Trigger for Molly Migration

Listens for mDNS/LLMNR/DNS requests from devices joining the network and spoofs responses to redirect captive portal checks (e.g., connectivitycheck.gstatic.com, msftconnecttest.com) to the local hydration server IP.

Requirements:
- Run as root/admin (to bind to UDP 53 and 5353)
- Python 3.7+
- scapy (pip install scapy)

Usage:
  sudo python3 mdns_dns_spoof.py --target-ip 192.168.0.100 --domains connectivitycheck.gstatic.com msftconnecttest.com

"""
import argparse
from scapy.all import *

# List of common captive portal check domains
DEFAULT_DOMAINS = [
    "connectivitycheck.gstatic.com",
    "clients3.google.com",
    "msftconnecttest.com",
    "msftncsi.com",
    "captive.apple.com",
    "detectportal.firefox.com",
]

def spoof_dns(pkt, target_ip, domains):
    if pkt.haslayer(DNSQR):
        qname = pkt[DNSQR].qname.decode().rstrip('.')
        if qname in domains:
            print(f"[+] Spoofing DNS for {qname} to {target_ip}")
            spoofed_pkt = IP(dst=pkt[IP].src, src=pkt[IP].dst)/\
                UDP(dport=pkt[UDP].sport, sport=53)/\
                DNS(id=pkt[DNS].id, qr=1, aa=1, qd=pkt[DNS].qd, an=DNSRR(rrname=pkt[DNS].qd.qname, ttl=60, rdata=target_ip))
            send(spoofed_pkt, verbose=0)

def main():
    parser = argparse.ArgumentParser(description="Molly Captive Portal DNS/mDNS Spoofer")
    parser.add_argument('--target-ip', required=True, help='IP address of hydration server (where captive portal page is served)')
    parser.add_argument('--domains', nargs='+', default=DEFAULT_DOMAINS, help='Domains to spoof (default: common captive portal domains)')
    args = parser.parse_args()

    print(f"[*] Spoofing DNS for: {args.domains}")
    print(f"[*] Redirecting to: {args.target_ip}")
    print("[*] Waiting for DNS queries...")

    sniff(filter="udp port 53", prn=lambda pkt: spoof_dns(pkt, args.target_ip, args.domains), store=0)

if __name__ == "__main__":
    main()
