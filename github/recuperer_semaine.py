"""Codex DCG : lit le bloc de code JSON de la page Notion « Codex DCG – fichier de la semaine »
et l'enregistre dans semaines/AAAA-MM-JJ.json (date du lundi). Utilisé par .github/workflows/publier.yml."""
import json
import os
import re
import sys
import urllib.request

TOKEN = os.environ["NOTION_TOKEN"]
PAGE = os.environ["NOTION_PAGE_ID"]


def get(url):
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + TOKEN, "Notion-Version": "2022-06-28"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main():
    blocks, cursor = [], None
    while True:
        url = f"https://api.notion.com/v1/blocks/{PAGE}/children?page_size=100" + (f"&start_cursor={cursor}" if cursor else "")
        data = get(url)
        blocks += data["results"]
        if not data.get("has_more"):
            break
        cursor = data["next_cursor"]
    codes = [b for b in blocks if b.get("type") == "code"]
    if not codes:
        print("::warning::Aucun bloc de code dans la page Notion.")
        return 0
    text = "".join(rt.get("plain_text", "") for rt in codes[0]["code"]["rich_text"])
    try:
        week = json.loads(text)
    except Exception as e:  # noqa: BLE001
        print(f"::error::JSON invalide dans Notion : {e}")
        return 1
    monday = week.get("semaine", "")
    if week.get("version") != 1 or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", monday) or not isinstance(week.get("jours"), list):
        print("::error::Le fichier ne respecte pas le format attendu (version 1, semaine, jours).")
        return 1
    path = f"semaines/{monday}.json"
    os.makedirs("semaines", exist_ok=True)
    new = json.dumps(week, ensure_ascii=False, indent=1) + "\n"
    old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
    if old == new:
        print(f"{path} est déjà à jour.")
    else:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new)
        print(f"{path} {'mis à jour' if old else 'ajouté'}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
