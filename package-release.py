"""Build a static upload or a publisher handoff. Only approved source assets enter a release."""
import argparse, io, json, re, subprocess, tempfile, zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parent
VERSION=json.loads((ROOT/'package.json').read_text())['version']
PAGES={'_headers','_redirects','favicon.svg','index.html','manifest.webmanifest','offline.html','offline.js','sw.js'}
VENDOR={'reader/vendor/pdf.min.mjs','reader/vendor/pdf.worker.min.mjs','reader/vendor/PDFJS-LICENSE.txt','reader/vendor/VERSION.md'}
DOCS={'.gitignore','CHANGELOG.md','DEPLOYMENT.md','FORWARDING.txt','GITHUB-SETUP.md','HANDOFF.md','README.md','START-HERE.txt','VALIDATION.md','dev-server.mjs','package-lock.json','package-release.py','package.json'}
AUTOMATION={'.github/workflows/verify.yml','.github/dependabot.yml','.github/ISSUE_TEMPLATE/reading-discrepancy.yml','.github/pull_request_template.md'}
def public_ok(name):
    return bool(name in PAGES|VENDOR or re.fullmatch(r'reader/[a-z][a-z\d-]*\.(?:js|css)',name) or re.fullmatch(r'reader/assets/icon(?:-(?:16|32|48|128|192|256|512)\.png|\.svg)',name))
def source_ok(name):
    return name in DOCS|AUTOMATION or bool(re.fullmatch(r'tests/[a-z][a-z\d.-]*\.mjs',name)) or name.startswith('public/') and public_ok(name[7:])
def git(*args,cwd=ROOT):
    return subprocess.check_output(['git',*args],cwd=cwd)
def entry(archive,name,data):
    info=zipfile.ZipInfo(name, date_time=(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
    archive.writestr(info,data,compresslevel=9)
def website():
    files={}
    for p in sorted((ROOT/'public').rglob('*')):
        rel=p.relative_to(ROOT/'public').as_posix()
        if p.is_symlink(): raise ValueError(f'Symlink in website: {rel}')
        if p.is_dir(): continue
        if not public_ok(rel):raise ValueError(f'Unapproved website asset: {rel}')
        if p.stat().st_size>=25*1024*1024:raise ValueError(f'Oversize asset: {rel}')
        files[rel]=p
    required=PAGES|VENDOR|{'reader/boot.js','reader/renderer.js','reader/report-periods.js','reader/priority-sections.js','reader/year-focus.js','reader/quoted-value.js','reader/headline-evidence.js','reader/cell-evidence.js','reader/assets/icon-192.png','reader/assets/icon-512.png'}
    if not required<=files.keys() or len(files)>1000:raise ValueError('Incomplete or oversize website')
    data=io.BytesIO()
    with zipfile.ZipFile(data,'w') as z:
        for n,p in files.items():entry(z,n,p.read_bytes())
    return data.getvalue(),len(files)
def source_paths():
    # Never walk an entire workspace or include test reports/screenshots.
    paths=DOCS|AUTOMATION|{p.relative_to(ROOT).as_posix() for p in (ROOT/'tests').glob('*.mjs')}|{p.relative_to(ROOT).as_posix() for p in (ROOT/'public').rglob('*') if p.is_file()}
    for n in sorted(paths):
        p=ROOT/n
        if p.is_symlink() or not p.is_file() or not source_ok(n):raise ValueError(f'Unapproved source file: {n}')
        yield n,p
def add_history(z):
    # Optional first GitHub Desktop handoff. Never inherit credentials, remote,
    # hooks, working files, repository config or dangling objects from the host.
    # Publish only the approved files + main's reviewed, reachable commit history.
    if git('symbolic-ref','--short','HEAD').strip()!=b'main' or git('status','--porcelain','--untracked-files=normal').strip():raise ValueError('Commit a clean main before packing history.')
    head=git('rev-parse','HEAD').strip();tag='v'+VERSION
    if git('rev-parse',tag+'^{commit}').strip()!=head:raise ValueError('Tag the tested release before packing history.')
    for sha in git('rev-list','main').decode().splitlines():
        names=git('ls-tree','-r','-z','--name-only',sha).decode().split('\0')
        if not all(source_ok(n) for n in names if n):raise ValueError('An unapproved path exists in Git history.')
    with tempfile.TemporaryDirectory() as tmp:
        clone=Path(tmp)/'portable'
        subprocess.run(['git','clone','-q','--no-local','--no-tags','--single-branch','--branch','main',str(ROOT),str(clone)],check=True)
        git('remote','remove','origin',cwd=clone)
        for t in git('tag','--merged','main').decode().splitlines():
            if re.fullmatch(r'v\d+\.\d+\.\d+',t):git('tag',t,git('rev-parse',t+'^{commit}').decode().strip(),cwd=clone)
        # A minimal repository works cross-platform and contains no environment paths.
        gitdir=clone/'.git'
        entry(z,'source/.git/config',b'[core]\n\trepositoryformatversion = 0\n\tfilemode = false\n\tbare = false\n\tlogallrefupdates = true\n')
        for p in sorted(gitdir.rglob('*')):
            n=p.relative_to(gitdir).as_posix()
            if p.is_file() and (n in {'HEAD','index','packed-refs'} or n.startswith(('objects/','refs/heads/','refs/tags/'))):
                entry(z,'source/.git/'+n,p.read_bytes())
def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--site-only',action='store_true');ap.add_argument('--desktop-git',action='store_true')
    ap.add_argument('output',nargs='?');args=ap.parse_args()
    if args.site_only and args.desktop_git:ap.error('Choose either the website or the source handoff.')
    out=Path(args.output).resolve() if args.output else ROOT.parent/f"Research-Report-Reader-v{VERSION.rsplit('.',1)[0]}-Free-Website.zip"
    if out==ROOT or (ROOT/'public') in out.parents:raise ValueError('Write the release outside public/.')
    site,count=website();out.parent.mkdir(parents=True,exist_ok=True)
    if args.site_only:out.write_bytes(site)
    else:
        bundle=io.BytesIO()
        with zipfile.ZipFile(bundle,'w') as z:
            for n in ('START-HERE.txt','GITHUB-SETUP.md'):entry(z,n,(ROOT/n).read_bytes())
            entry(z,'WEBSITE-UPLOAD.zip',site)
            for n,p in source_paths():entry(z,'source/'+n,p.read_bytes())
            if args.desktop_git:add_history(z)
        out.write_bytes(bundle.getvalue())
    print(json.dumps({'website_files':count,'site_zip_bytes':len(site),'release_bytes':out.stat().st_size,'path':str(out)}))
if __name__=='__main__':main()
