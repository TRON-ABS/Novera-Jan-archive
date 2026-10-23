from __future__ import annotations
import argparse
from collections import Counter
import json
from pathlib import Path
import re


def flatten(value, prefix=''):
    if isinstance(value, str):
        return {prefix: value}
    result = {}
    for key, child in value.items():
        result.update(flatten(child, f'{prefix}.{key}' if prefix else key))
    return result


def validate(root):
    locales = root / 'web-app/src/locales'
    inventory = json.loads((root / 'docs/language-support.json').read_text(encoding='utf-8'))
    english = {p.name: flatten(json.loads(p.read_text(encoding='utf-8'))) for p in (locales / 'en').glob('*.json')}
    total = sum(map(len, english.values()))
    errors = []
    rows = []
    for entry in inventory:
        code = entry['locale']
        covered = 0
        extras = []
        missing = []
        issues = []
        for namespace, original in english.items():
            source = locales / code / namespace
            translated = flatten(json.loads(source.read_text(encoding='utf-8'))) if source.exists() else {}
            covered += len(set(translated) & set(original))
            if entry['source_pr'] is None:
                continue
            missing.extend(f'{namespace}:{key}' for key in set(original) - set(translated))
            extras.extend(f'{namespace}:{key}' for key in set(translated) - set(original))
            for key in set(original) & set(translated):
                value, reference = translated[key], original[key]
                if reference and not value.strip():
                    issues.append(f'{namespace}:{key}: empty')
                for label, pattern in [('interpolation', r'\{\{(\w+)\}\}'), ('code literal', r'`[^`]*`')]:
                    left, right = re.findall(pattern, value), re.findall(pattern, reference)
                    if (Counter(left) != Counter(right) if label == 'interpolation' else left != right):
                        issues.append(f'{namespace}:{key}: {label}')
                if re.search(r'JANPH|JANSEG|ZXQ|QXZ|\uFFFD', value):
                    issues.append(f'{namespace}:{key}: temporary marker')
        if extras:
            issues.append(f'{len(extras)} unknown keys')
        if missing and entry['source_pr'] is not None and not entry['partial']:
            issues.append(f'{len(missing)} missing keys')
        if covered != entry['keys'] or total != entry['total']:
            issues.append('documented coverage differs from catalog')
        errors.extend(f'{code}: {message}' for message in issues)
        rows.append({'locale': code, 'covered': covered, 'total': total, 'partial': entry['partial']})
    selector = (root / 'web-app/src/containers/LanguageSwitcher.tsx').read_text(encoding='utf-8')
    choices = re.findall(r"value: '([^']+)'", selector)
    language_type = (root / 'web-app/src/types/app.d.ts').read_text(encoding='utf-8').split('interface LogEntry')[0]
    types = re.findall(r"\| '([^']+)'", language_type)
    catalogs = {p.name for p in locales.iterdir() if p.is_dir() and p.name != '__tests__'}
    registered = {row['locale'] for row in inventory}
    if set(choices) != catalogs or set(types) != catalogs or registered != catalogs or len(choices) != len(set(choices)):
        errors.append('selector, Language type, documentation and catalog registrations differ')
    # Every JSON file must parse, including inherited catalogs.
    for source in locales.rglob('*.json'):
        json.loads(source.read_text(encoding='utf-8'))
    return {'locales': len(choices), 'integrated_contributions': sum(row['source_pr'] is not None for row in inventory), 'english_keys': total, 'errors': errors, 'coverage': rows, 'compiled': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Check Novera locale structure without compiling the app.')
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    arguments = parser.parse_args()
    result = validate(arguments.root.resolve())
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(bool(result['errors']))
