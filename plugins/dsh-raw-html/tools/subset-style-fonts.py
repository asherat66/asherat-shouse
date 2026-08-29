#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
dsh-raw-html —— 12 风格全字体批量子集化（先生 2026-08-29 拍板：全量打包，开盖即用）
把美学系统 12 个风格用到的全部外置字体子集化（GB2312 一级 + 标点）为 woff2，
输出到插件 assets/fonts/，随包分发——任何电脑安装插件后即可通过 /fonts/ 使用。
用法：python subset-style-fonts.py
依赖：fonttools（或使用自带 fonttools 的 venv Python）
"""
import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from fontTools import subset
from fontTools.ttLib import TTFont
import subset_fonts  # 复用 build_charset

PLUGIN_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(PLUGIN_ROOT, 'assets', 'fonts')
os.makedirs(OUT_DIR, exist_ok=True)

# 别名 → 源 TTF 路径（相对 I:\字体\ 字体根）
FONTS = [
    # 宋体组（warm-minimal）
    ('Lanxi-可宋', '造字工房最全字体-2016-01-06更新/宋体系列/MFKeSong_Noncommercial-Regular.ttf'),
    ('Lanxi-朗宋', '造字工房最全字体-2016-01-06更新/宋体系列/MFLangSong_Noncommercial-Regular.ttf'),
    ('Lanxi-品宋', '造字工房最全字体-2016-01-06更新/宋体系列/MFPinSong_Noncommercial-Regular.ttf'),
    ('Lanxi-颜宋', '造字工房最全字体-2016-01-06更新/宋体系列/MFYanSong_Noncommercial-Regular.ttf'),
    ('Lanxi-静黑超细', '造字工房最全字体-2016-01-06更新/黑体系列/MFJingHei_Noncommercial-UltLight.ttf'),
    # 黑体/几何组（cyberpunk / porcelain-data / brutalism）
    ('Lanxi-点黑', '造字工房最全字体-2016-01-06更新/黑体系列/MFDianHei_Noncommercial-Regular.ttf'),
    ('Lanxi-超粗黑', '方正所有字体/02/FZfonts/FZCCHJW.TTF'),
    # 可爱组（pop-flat / maiden-diary）
    ('Lanxi-卡通', '常用字体/迷你简卡通.TTF'),
    ('Lanxi-叮叮', '造字工房最全字体-2016-01-06更新/手绘字体/MFDingDing_Noncommercial-Regular.ttf'),
    ('Lanxi-喵喵', '造字工房最全字体-2016-01-06更新/艺术字体/MFMiaoMiao_Noncommercial-Regular.ttf'),
    # 手写组（ink-letter / wabi-sabi / wire-news 刊头）
    ('Lanxi-春兰茅坤', '新增-2026-08-28/Aa今日花青-春兰茅坤.ttf'),
    ('Lanxi-鱼尾行书', '新增-2026-08-28/鱼尾书法行书-简体.ttf'),
    # 少女风组（maiden-diary）
    ('Lanxi-秀英体', '少女风/汉仪秀英体简-v2.ttf'),
    ('Lanxi-暗恋初夏', '少女风/暗恋初夏少女.ttf'),
    ('Lanxi-初心少女', '少女风/初心少女体简.ttf'),
    ('Lanxi-丫丫体', '少女风/汉仪丫丫体简.ttf'),
]

FONTS_ROOT = 'I:/字体/'
charset = subset_fonts.build_charset()
print('charset size:', len(charset), 'chars')
print('targets:', len(FONTS), 'fonts')

total_in = 0.0
total_out = 0.0
for alias, rel in FONTS:
    src = os.path.join(FONTS_ROOT, rel)
    out = os.path.join(OUT_DIR, alias + '.woff2')
    ttf_size = os.path.getsize(src) / 1024 / 1024
    total_in += ttf_size
    try:
        opts = subset.Options()
        opts.flavor = 'woff2'
        opts.layout_features = ['*']
        opts.name_IDs = ['*']
        opts.notdef_outline = True
        opts.recalc_bounds = True
        ss = subset.Subsetter(options=opts)
        f = TTFont(src, lazy=False)
        ss.populate(text=charset)
        ss.subset(f)
        f.save(out)
        w = os.path.getsize(out) / 1024 / 1024
        total_out += w
        print('%-16s %6.2f -> %6.2f MB' % (alias, ttf_size, w))
        f.close()
    except Exception as e:
        print('%-16s ERROR %r' % (alias, e))
print('=== 合计: TTF %.1f MB -> woff2 %.2f MB ===' % (total_in, total_out))
