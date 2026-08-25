# -*- coding: utf-8 -*-
"""生成 Windows 应用图标:
1. 从用户提供的 PNG 读取原图
2. 生成多分辨率 .ico (16/24/32/48/64/128/256)
3. 生成 256px 的 icon.png(供 Electron BrowserWindow 使用)
输出写入 desktop/build/。
"""
import os
from PIL import Image

import sys
# 图标源图:通过命令行参数指定(如: python make_icon.py <图片路径>)
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "build", "icon-source.png")
BUILD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "build")
ICON_SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]

os.makedirs(BUILD_DIR, exist_ok=True)

img = Image.open(SRC).convert("RGBA")
print("source size:", img.size, "mode:", img.mode)

# .ico 要求平方尺寸;若源图非方形,做居中裁剪为正方形
w, h = img.size
side = min(w, h)
left = (w - side) // 2
top = (h - side) // 2
square = img.crop((left, top, left + side, top + side))

# 生成各分辨率作为 .ico 帧(以最大 256 为基图,其余作为 append_images)
frames = []
for (sw, sh) in sorted(ICON_SIZES, reverse=True):  # 降序,基图取最大
    frames.append(square.resize((sw, sh), Image.LANCZOS))

ico_path = os.path.join(BUILD_DIR, "icon.ico")
base = frames[0]                       # 256x256 基图
append = frames[1:]                    # 其余较小尺寸帧
sizes = [(sw, sh) for (sw, sh) in sorted(ICON_SIZES, reverse=True)]
base.save(ico_path, format="ICO", sizes=sizes, append_images=append)
print("wrote:", ico_path)

# 256px 的 icon.png(BrowserWindow 图标)
png_path = os.path.join(BUILD_DIR, "icon.png")
square.resize((256, 256), Image.LANCZOS).save(png_path, format="PNG")
print("wrote:", png_path)

# 同时复制一份用户原图到 build/ 便于追溯
orig_copy = os.path.join(BUILD_DIR, "source-icon.png")
Image.open(SRC).convert("RGBA").save(orig_copy, format="PNG")
print("wrote:", orig_copy)
print("DONE")
