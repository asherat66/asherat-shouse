#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
dsh-raw-html —— 字体子集化工具

把精选字体裁剪为「GB2312 一级常用字 + 全角标点 + 数字字母」子集，
大幅压缩体积（中文艺术字体 5-20MB → 0.3-1.5MB），输出到插件 assets/fonts/，
随插件分发——任何电脑安装插件后，卡片即可通过 /fonts/ 使用这些字体。

字符集构成：
  - GB2312 一级汉字 3755 个（拼音序常用字，由码位动态生成，无需外部字表）
  - ASCII 可打印字符 + 全角标点 + 中文数字/序号（壹贰叁… 用于章节标题）

用法：
  python subset_fonts.py            # 使用默认清单
  python subset_fonts.py --dry-run  # 只打印计划不执行

依赖：pip install fonttools（或使用自带 fonttools 的 venv Python）
"""

import argparse
import os
import sys
import time

# 插件根目录（本文件位于 <插件>/tools/）
PLUGIN_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(PLUGIN_ROOT, 'assets', 'fonts')
DEFAULT_FONTS_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'font-src')


def gb2312_level1():
    """GB2312 一级汉字（3755 个，拼音序）：16~55 区（0xB0A1~0xD7FE）。"""
    chars = []
    for row in range(0xB0, 0xD8):  # 0xB0(16区) ~ 0xD7(55区)
        for col in range(0xA1, 0xFF):
            try:
                chars.append(bytes([row, col]).decode('gb2312'))
            except UnicodeDecodeError:
                continue
    return ''.join(chars)


def build_charset():
    """完整字符集：数字字母 + 标点 + 中文数字 + GB2312 一级字。"""
    ascii_printable = ''.join(chr(i) for i in range(0x20, 0x7F))
    punct = '，。！？；：、（）「」『』《》〈〉—…·％￥＃＆＊＋－＝×÷‘’“”·　'
    numerals = '零一二三四五六七八九十百千万亿壹贰叁肆伍陆柒捌玖拾佰仟〇①②③④⑤⑥⑦⑧⑨⑩'
    extra = '的了吗呢吧啊哦嗯哟咿唔啦呗嘛蓝汐深鲸湾女仆先生喵咕噜噜'
    return ascii_printable + punct + numerals + extra + gb2312_level1()


# (显示名, 相对「字体根目录」的路径, 输出文件名)
# 全部为开源授权字体（OFL/Apache），随插件分发无授权风险：
#   霞鹜文楷 GB-Lite（OFL）、马善政楷书（OFL）、思源黑体 Noto Sans CJK SC（OFL）、Great Vibes（OFL）
FONTS = [
    ('文楷', 'LXGWWenKaiGBLite-Regular.ttf', 'Lanxi-WenKai.woff2'),
    ('文楷细', 'LXGWWenKaiGBLite-Light.ttf', 'Lanxi-WenKaiLight.woff2'),
    ('马善政楷书', 'MaShanZheng-Regular.ttf', 'Lanxi-MaShanZheng.woff2'),
    ('思源黑', 'NotoSansCJKsc-Regular.otf', 'Lanxi-HeiTi.woff2'),
    ('思源细黑', 'NotoSansCJKsc-Light.otf', 'Lanxi-HeiTiLight.woff2'),
    ('思源粗黑', 'NotoSansCJKsc-Bold.otf', 'Lanxi-HeiTiBold.woff2'),
    ('花体', 'GreatVibes-Regular.ttf', 'Lanxi-GreatVibes.woff2'),
]


def subset_one(src, dst):
    """用 fontTools.subset 裁剪字体。"""
    from fontTools import subset as ft_subset

    opts = ft_subset.Options()
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.name_languages = ['*']
    opts.notdef_outline = True
    opts.recalc_bounds = True
    opts.drop_tables = []

    font = ft_subset.load_font(src, opts)
    ss = ft_subset.Subsetter(opts)
    ss.populate(text=build_charset())
    ss.subset(font)
    # woff2：现代浏览器全支持，体积再减半（需 brotli：pip install brotli）
    # 注意：必须用 TTFont.save() 而非 subset.save_font()——后者会忽略 flavor。
    font.flavor = 'woff2'
    font.save(dst)


def main():
    parser = argparse.ArgumentParser(description='dsh-raw-html 字体子集化')
    parser.add_argument('--dry-run', action='store_true', help='只打印计划')
    parser.add_argument('--fonts-root', default=DEFAULT_FONTS_ROOT, help='字体根目录（默认 I:\\字体）')
    args = parser.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    charset = build_charset()
    print(f'字符集：{len(charset)} 字（GB2312 一级 {len(gb2312_level1())} + 标点/数字/序号）')
    print(f'输出目录：{OUT_DIR}')
    print('-' * 64)

    total_before = 0
    total_after = 0
    for name, rel, out in FONTS:
        src = os.path.join(args.fonts_root, rel)
        if not os.path.exists(src):
            print(f'[SKIP] {name}: 源不存在 {src}')
            continue
        before = os.path.getsize(src)
        total_before += before
        dst = os.path.join(OUT_DIR, out)
        if args.dry_run:
            print(f'[PLAN] {name}: {before / 1e6:.1f}MB -> {dst}')
            continue
        t0 = time.time()
        try:
            subset_one(src, dst)
            after = os.path.getsize(dst)
            total_after += after
            pct = after / before * 100
            print(f'[ OK ] {name}: {before/1e6:.1f}MB -> {after/1e6:.1f}MB ({pct:.0f}%)  {time.time()-t0:.1f}s')
        except Exception as exc:
            print(f'[FAIL] {name}: {exc}')

    if not args.dry_run and total_before > 0:
        print('-' * 64)
        print(f'合计：{total_before/1e6:.1f}MB -> {total_after/1e6:.1f}MB（{total_after/total_before*100:.0f}%）')


if __name__ == '__main__':
    main()
