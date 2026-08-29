#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""补充子集化：狂侠体（GB2312）+ 鱼尾行书繁（全 BMP，保繁体覆盖）。"""
import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from fontTools import subset
from fontTools.ttLib import TTFont
import subset_fonts

PLUGIN_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(PLUGIN_ROOT, 'assets', 'fonts')
os.makedirs(OUT_DIR, exist_ok=True)

charset = subset_fonts.build_charset()
tasks = [
    ('Lanxi-狂侠体', 'I:/字体/新增-2026-08-28/Aa狂侠体.ttf', set(charset)),
    ('Lanxi-鱼尾行书繁', 'I:/字体/新增-2026-08-28/鱼尾书法行书-繁体.ttf', set(range(0x20, 0x10000))),
]
for alias, src, unicodes in tasks:
    try:
        opts = subset.Options()
        opts.flavor = 'woff2'
        opts.layout_features = ['*']
        opts.name_IDs = ['*']
        opts.notdef_outline = True
        opts.recalc_bounds = True
        ss = subset.Subsetter(options=opts)
        f = TTFont(src, lazy=False)
        ss.populate(unicodes=unicodes)
        ss.subset(f)
        out = os.path.join(OUT_DIR, alias + '.woff2')
        f.save(out)
        print('%-16s %6.2f -> %6.2f MB' % (alias, os.path.getsize(src)/1048576, os.path.getsize(out)/1048576))
        f.close()
    except Exception as e:
        print('%-16s ERROR %r' % (alias, e))
print('=== done ===')
