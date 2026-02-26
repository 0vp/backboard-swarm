import requests
import json
import hashlib
import random
import string
import argparse
import sys

def get_webshare_proxy():
    """Get Webshare rotating proxy configuration"""
    # Webshare rotating proxy settings
    proxy_url = "http://sgjgvlbt-rotate:sqrgkey6k7br@p.webshare.io:80"
    return {
        'http': proxy_url,
        'https': proxy_url
    }

def get_matchup(proxies=None):
    """Fetch a random matchup from hackelo API"""
    url = 'https://hackelo.vercel.app/api/matchup'
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:147.0) Gecko/20100101 Firefox/147.0',
        'Accept': '*/*',
        'Accept-Language': 'en-CA,en-US;q=0.9,en;q=0.8',
        'Referer': 'https://hackelo.vercel.app/',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Priority': 'u=4',
        'TE': 'trailers'
    }

    response = requests.get(url, headers=headers, proxies=proxies, timeout=30)
    response.raise_for_status()
    return response.json()

def generate_fingerprint():
    """Generate a unique fingerprint for each vote"""
    # Generate random string
    random_str = ''.join(random.choices(string.ascii_letters + string.digits, k=32))
    # Create MD5 hash
    return hashlib.md5(random_str.encode()).hexdigest()

def vote(winner_id, loser_id, proxies=None, fingerprint=None):
    """Submit a vote to the hackelo API"""
    if fingerprint is None:
        fingerprint = generate_fingerprint()
    url = 'https://hackelo.vercel.app/api/vote'
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:147.0) Gecko/20100101 Firefox/147.0',
        'Accept': '*/*',
        'Accept-Language': 'en-CA,en-US;q=0.9,en;q=0.8',
        'Referer': 'https://hackelo.vercel.app/',
        'Content-Type': 'application/json',
        'Origin': 'https://hackelo.vercel.app',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'Priority': 'u=0',
        'TE': 'trailers'
    }
    data = {
        'winner_id': winner_id,
        'loser_id': loser_id,
        'fingerprint': fingerprint
    }

    response = requests.post(url, headers=headers, json=data, proxies=proxies, timeout=30)
    response.raise_for_status()
    return response.json()

def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Vote for McHacks on Hackelo')
    parser.add_argument('--loop', action='store_true', help='Keep looping and voting for McHacks indefinitely')
    args = parser.parse_args()

    # Get Webshare rotating proxy
    proxy = get_webshare_proxy()
    print("Using Webshare rotating proxy (p.webshare.io:80)")

    vote_count = 0

    while True:
        try:
            # Get matchup using proxy
            print("Fetching matchup...")
            matchup = get_matchup(proxy)

            h1 = matchup['hackathon1']
            h2 = matchup['hackathon2']

            print(f"Matchup: {h1['name']} ({h1['school']}) vs {h2['name']} ({h2['school']})")
            print(f"Ratings: {h1['name']}: {h1['rating']:.0f} vs {h2['name']}: {h2['rating']:.0f}")

            winner_id = None
            loser_id = None
            winner_name = None

            # Check if McHacks is in the matchup - always vote for McHacks if present
            if 'McHacks' in h1['name'] or 'McGill' in h1['school']:
                winner_id = h1['id']
                loser_id = h2['id']
                winner_name = h1['name']
                print(f"Found McHacks! Voting for {h1['name']}...")
            elif 'McHacks' in h2['name'] or 'McGill' in h2['school']:
                winner_id = h2['id']
                loser_id = h1['id']
                winner_name = h2['name']
                print(f"Found McHacks! Voting for {h2['name']}...")
            else:
                # No McHacks - vote for the worse school (lower rating)
                if h1['rating'] < h2['rating']:
                    winner_id = h1['id']
                    loser_id = h2['id']
                    winner_name = h1['name']
                else:
                    winner_id = h2['id']
                    loser_id = h1['id']
                    winner_name = h2['name']
                print(f"No McHacks. Voting for worse school: {winner_name}")

            # Vote with unique fingerprint using same proxy
            fingerprint = generate_fingerprint()
            print(f"Using fingerprint: {fingerprint}")
            result = vote(winner_id, loser_id, proxy, fingerprint)
            vote_count += 1
            print(f"Vote #{vote_count} result: {result}")

            if not args.loop:
                # Exit after first vote if --loop not specified
                break
            else:
                print(f"Total votes cast: {vote_count}. Continuing to next matchup...\n")
                continue

        except requests.exceptions.ProxyError as e:
            print(f"Proxy error: {e}, retrying...")
            continue
        except requests.exceptions.Timeout as e:
            print(f"Timeout error: {e}, retrying...")
            continue
        except requests.exceptions.RequestException as e:
            print(f"Request error: {e}, retrying...")
            continue
        except KeyboardInterrupt:
            print(f"\n\nStopped by user. Total votes cast: {vote_count}")
            sys.exit(0)

if __name__ == '__main__':
    main()
