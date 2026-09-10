"""Build public data from pinned, licensed source snapshots. No network calls."""
import csv, gzip, hashlib, io, json, re
from collections import Counter, defaultdict
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = json.loads((ROOT / 'data/source-manifest.json').read_text())
FILES = {f['id']: f for f in MANIFEST['files']}

def raw(name):
    f = FILES[name]
    stored = (ROOT / f['path']).read_bytes()
    assert hashlib.sha256(stored).hexdigest() == f['storedSha256'], name
    b = gzip.decompress(stored) if f['path'].endswith('.gz') else stored
    assert hashlib.sha256(b).hexdigest() == f['sha256'], name
    return b

def rows(name):
    return list(csv.DictReader(io.StringIO(raw(name).decode('utf-8-sig'))))

def sheet(name, tab):
    return list(openpyxl.load_workbook(io.BytesIO(raw(name)), data_only=True)[tab].values)

def save(name, obj):
    (ROOT / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')

def number(v):
    if v is None or v in ('—', '-', ''):
        return None
    assert type(v) in (float, int), repr(v)
    return v

def normalized_title(v):
    return ' '.join(re.findall(r'\w+', v.lower()))

def main():
    exposure = sheet('ai-exposure-categories.xlsx', 'AI Exposure Categories')
    start, end = map(int, re.search(r'(\d{4})[–-](\d{2,4})', exposure[0][0]).groups())
    if end < 100:
        end += start // 100 * 100
    assert 'thousands' in exposure[0][0]
    assert str(start) in exposure[1][5] and str(end)[-2:] in exposure[1][5]
    directory = sheet('bls-directory.xlsx', '2025-35 Occupational Directory')
    detailed = {r[1]: r[2] for r in directory[4:] if r[3] == 'Line item'}
    summaries = [r[1] for r in directory[4:] if r[3] == 'Summary']
    crosswalk = sheet('bls-crosswalk.xlsx', 'Crosswalk')
    mappings = []
    by_bls, by_onet = defaultdict(list), defaultdict(list)
    for row, r in enumerate(crosswalk[5:], 6):
        assert r[3] in detailed
        m = {'onetCode': r[1], 'code': r[3], 'row': row, 'onetTitle': r[2], 'blsTitle': r[4]}
        mappings.append(m); by_bls[r[3]].append(m); by_onet[r[1]].append(m)
    assert len({(m['onetCode'],m['code']) for m in mappings}) == len(mappings)
    onet_rows = rows('occupation_data.csv')
    onet = {r['O*NET-SOC Code']: r for r in onet_rows}
    assert len(onet) == len(onet_rows)
    assert set(by_onet) <= set(onet)
    tasks = defaultdict(list)
    for r in rows('task_statements.csv'):
        if r['Task Type'] == 'Core':
            tasks[r['O*NET-SOC Code']].append(r)
    urls = {n: f['url'] for n, f in FILES.items()}
    occupations, aliases, broader = [], set(), []
    for row, r in enumerate(exposure[2:], 3):
        if r[1] is None:
            continue
        code = r[1]
        assert code in detailed and r[0] == detailed[code]
        assert r[12] in ('Low', 'Moderate', 'High', 'Very high', None, '—')
        roles = []
        for m in sorted(by_bls[code], key=lambda v: v['onetCode']):
            source = onet[m['onetCode']]
            broad = len(by_bls[code]) > 1 or normalized_title(source['Title']) != normalized_title(r[0])
            selected = sorted(tasks[m['onetCode']], key=lambda t: int(t['Task ID']))[:3]
            role = {'code': m['onetCode'], 'title': source['Title'], 'description': source['Description'], 'source': urls['occupation_data.csv'], 'broader': broad,
                    'tasks': [{'id': t['Task ID'], 'text': t['Task'], 'date': t['Date'], 'source': urls['task_statements.csv']} for t in selected]}
            roles.append(role)
            if broad:
                broader.append({**m, 'reason': 'multiple O*NET roles' if len(by_bls[code]) > 1 else 'published role and canonical titles differ; conservatively mark broader scope'})
            aliases.add((source['Title'], code, role['code']))
        opening = number(r[7])
        occupations.append({'code': code, 'title': r[0], 'exposure': None if r[12] in (None, '—') else r[12], 'growth': number(r[5]), 'annualOpenings': None if opening is None else round(opening * 1000), 'startYear': start, 'endYear': end, 'roles': roles, 'sourceRow': row, 'source': urls['ai-exposure-categories.xlsx'], 'mappingSource': urls['bls-crosswalk.xlsx']})
        aliases.add((r[0], code, None))
    assert {o['code'] for o in occupations} == set(detailed)
    for name, fields in [('job_titles.csv', ['Job Title', 'Short Title']), ('sample_of_reported_titles.csv', ['Reported Job Title'])]:
        for r in rows(name):
            for m in by_onet.get(r['O*NET-SOC Code'], []):
                for field in fields:
                    if r[field].strip():
                        aliases.add((r[field], m['code'], m['onetCode']))
    release = {'id': f'bls-{start}-{end}_onet-31.0', 'bls': '2025–2035 projections and AI exposure categories; published August 27, 2026', 'onet': 'O*NET 31.0 (O*NET-SOC 2019 taxonomy)', 'retrieved': max(f['retrieved'] for f in MANIFEST['files']), 'startYear': start, 'endYear': end, 'sources': {'exposure': urls['ai-exposure-categories.xlsx'], 'methodology': 'https://www.bls.gov/emp/publications/ai-exposure-categories.htm', 'outlook': 'https://www.bls.gov/emp/tables/occupational-projections-and-characteristics.htm', 'mapping': urls['bls-crosswalk.xlsx'], 'directory': urls['bls-directory.xlsx'], 'onet': 'https://www.onetcenter.org/database.html', 'license': 'https://www.onetcenter.org/license_db.html'}}
    snapshot = {'release': release, 'occupations': occupations}
    lexicon = {'release': release['id'], 'aliases': [{'title': t, 'code': c, 'onetCode': o} for t, c, o in sorted(aliases, key=lambda a:(a[0],a[1],a[2] or ''))]}
    exceptions = {'release': release['id'], 'unmappedOnet': [{'code': c, 'title': onet[c]['Title'], 'reason': 'Absent from official BLS O*NET-to-NEM crosswalk; no result or inferred statistic created'} for c in sorted(set(onet) - set(by_onet))], 'unmappedBls': [o['code'] for o in occupations if not o['roles']], 'missingExposure': [o['code'] for o in occupations if o['exposure'] is None], 'withoutCoreTasks': [c for c in sorted(by_onet) if not tasks[c]], 'broaderMappings': broader, 'oneOnetToManyBls': {c:[m['code'] for m in ms] for c,ms in by_onet.items() if len(ms)>1}, 'manyOnetToOneBls': {c:[m['onetCode'] for m in ms] for c,ms in by_bls.items() if len(ms)>1}, 'excludedSummaryCodes': summaries}
    save('public/data/occupations.json', snapshot)
    save('public/data/lexicon.json', lexicon)
    save('data/exceptions.json', exceptions)
    # Compact independently inspectable source rows and relation IDs for offline release checks.
    save('data/source-reference.json', {'release': release['id'], 'startYear': start, 'endYear': end, 'source': urls, 'onetCodes': sorted(onet), 'detailed': [{'code': o['code'], 'title': o['title'], 'row': o['sourceRow'], 'exposure': o['exposure'], 'growth': o['growth'], 'annualOpenings': o['annualOpenings']} for o in occupations], 'summaryCodes': summaries, 'mappings': mappings, 'aliasCount': len(aliases), 'lexiconSha256': hashlib.sha256((ROOT/'public/data/lexicon.json').read_bytes()).hexdigest(), 'snapshotSha256': hashlib.sha256((ROOT/'public/data/occupations.json').read_bytes()).hexdigest(), 'units': {'growth':'percent change over projection period', 'annualOpenings':'jobs per year; source thousands multiplied by 1000'}})
    print(json.dumps({'status':'PASS','occupations':len(occupations),'relations':len(mappings),'aliases':len(aliases),'unmappedOnet':len(exceptions['unmappedOnet']),'categories':dict(Counter(o['exposure'] for o in occupations))}))

if __name__ == '__main__':
    main()
