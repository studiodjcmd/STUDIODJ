"""Create a deterministic, test-only bundle without mutating the baseline."""
import argparse
import hashlib
import json
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "controller" / "baseline"
def build(out):
    out.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((BASE / "sha256.json").read_text())
    for name, digest in manifest.items():
        if hashlib.sha256((BASE / name).read_bytes()).hexdigest() != digest:
            raise ValueError("Baseline hash mismatch: " + name)
    skin = out / "skins" / "StudioDJ"
    shutil.copytree(ROOT / "skin" / "StudioDJ", skin, dirs_exist_ok=True)
    controller = out / "controllers"
    controller.mkdir(exist_ok=True)
    source = BASE / "Numark NS6 Original.midi.xml"
    tree = ET.parse(source)
    root = tree.getroot()
    root.find("info/name").text = "Studio DJ - Numark NS6 Original (Alpha)"
    root.find("info/description").text = "Original NS6 mapping with optional Studio DJ navigation/preview and busy deck LOAD guard. Experimental."
    # Keep the original author and add separate overlay credit in the documentation.
    root.find("./settings/group/option[@variable='traktmixxxRaw']").set("default", "false")
    scripts = root.find("./controller/scriptfiles")
    scripts.find("file[@functionprefix='NumarkNS6']").set("filename", "Studio-NS6-Baseline.js")
    ET.SubElement(scripts, "file", filename="Studio-NS6-UI.js", functionprefix="StudioNS6")
    root.find("./controller/init-function").text = "StudioNS6.init"
    ET.indent(tree, space="  ")
    tree.write(controller / "Studio DJ - Numark NS6 Original.midi.xml", encoding="UTF-8", xml_declaration=True)
    shutil.copyfile(BASE / "Numark-NS6-Original.js", controller / "Studio-NS6-Baseline.js")
    shutil.copyfile(ROOT / "controller/studio/Studio-NS6-UI.js", controller / "Studio-NS6-UI.js")
    shutil.copyfile(ROOT / "tools/Install-StudioDJ.ps1", out / "Install-StudioDJ.ps1")
    shutil.copyfile(ROOT / "docs/TEST-GUIDE.md", out / "TEST-GUIDE.md")
    shutil.copyfile(ROOT / "docs/ARCHITECTURE.md", out / "ARCHITECTURE.md")
    files = sorted(p for p in out.rglob("*") if p.is_file() and p.name != "SHA256SUMS.json")
    (out / "SHA256SUMS.json").write_text(json.dumps({p.relative_to(out).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in files},indent=2)+"\n",encoding="utf-8")
def zip_bundle(out, target):
    target.parent.mkdir(parents=True,exist_ok=True)
    with ZipFile(target,"w",compression=ZIP_DEFLATED,compresslevel=9) as z:
        for p in sorted(out.rglob("*")):
            if p.is_file():
                i=ZipInfo(p.relative_to(out).as_posix(),(2026,1,1,0,0,0))
                i.compress_type=ZIP_DEFLATED
                z.writestr(i,p.read_bytes())
if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--out",type=Path,required=True)
    p.add_argument("--zip",type=Path)
    a=p.parse_args()
    if a.out.exists() and any(a.out.iterdir()):
        raise SystemExit("Use a new empty output directory")
    build(a.out)
    if a.zip: zip_bundle(a.out,a.zip)
