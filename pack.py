# -*- coding: utf-8 -*-
"""先运行 npm run build，再运行本脚本生成 Windows 免安装包。"""
from pathlib import Path
import shutil
import tempfile
import time
import zipfile

SRC = Path(__file__).resolve().parent
OUT_ZIP = SRC / '局域网弹幕房间-win32-x64.zip'
DOCS = ['启动弹幕.bat', '使用说明.txt', '放行防火墙.bat', '给朋友的加入说明.md']

def main():
    started = time.time()
    required = ['out', 'package.json', 'node_modules/electron/dist', 'scripts/allow-firewall.ps1', *DOCS]
    for name in required:
        if not (SRC / name).exists():
            raise FileNotFoundError(f'缺少打包文件：{SRC / name}')

    # 临时目录自动清理，不再删除固定的 D 盘目录。
    with tempfile.TemporaryDirectory(prefix='lan-danmaku-pack-') as temp:
        stage = Path(temp) / '局域网弹幕房间'
        stage.mkdir()
        shutil.copytree(SRC / 'out', stage / 'out')
        shutil.copy2(SRC / 'package.json', stage)
        shutil.copytree(SRC / 'node_modules/electron/dist', stage / 'node_modules/electron/dist')
        (stage / 'scripts').mkdir()
        shutil.copy2(SRC / 'scripts/allow-firewall.ps1', stage / 'scripts/allow-firewall.ps1')
        for name in DOCS:
            shutil.copy2(SRC / name, stage)
        archive = Path(temp) / OUT_ZIP.name
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as output:
            for file in stage.rglob('*'):
                if file.is_file():
                    output.write(file, file.relative_to(stage.parent))
        shutil.copy2(archive, OUT_ZIP)
    print(f'打包完成：{OUT_ZIP}，{OUT_ZIP.stat().st_size / 1048576:.1f} MB，耗时 {time.time() - started:.0f}s')

if __name__ == '__main__':
    main()
