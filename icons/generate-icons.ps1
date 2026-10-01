# またね アイコン生成（Node/Python不要、.NET System.Drawing のみ）
# 使い方: powershell -ExecutionPolicy Bypass -File icons/generate-icons.ps1 [-Preview]
# 他の自作アプリと角丸の形・余白をそろえ、色と中の記号だけ変えている。
# 記号：虹（いちばん外は朱）と、その上に光る星（＝いつか叶えたいこと）
param([switch]$Preview)
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function C([string]$hex) { return [System.Drawing.ColorTranslator]::FromHtml($hex) }

function RoundRect([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

# 星（とがりが n 個。n=5 ふつうの星、n=4 きらめき）
function StarPath([single]$cx, [single]$cy, [single]$r, [single]$inner, [int]$n) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $pts = New-Object 'System.Collections.Generic.List[System.Drawing.PointF]'
  for ($i = 0; $i -lt $n * 2; $i++) {
    $a = -[Math]::PI / 2 + $i * [Math]::PI / $n
    $rr = if ($i % 2 -eq 0) { $r } else { $r * $inner }
    $pts.Add((New-Object System.Drawing.PointF([single]($cx + $rr * [Math]::Cos($a)), [single]($cy + $rr * [Math]::Sin($a)))))
  }
  $p.AddPolygon($pts.ToArray())
  return $p
}

$RAINBOW = @('#E2462A', '#F28A26', '#F5C330', '#3FAE6E', '#3A84D4', '#7457CC')   # 朱・橙・黄・緑・青・紫

function Draw-Icon($g, [single]$size, [string]$variant, [single]$scale) {
  $s = $size * $scale
  $ox = ($size - $s) / 2
  $night = $variant -eq 'night'
  # 虹
  $cx = $ox + $s * 0.5; $cy = $ox + $s * 0.80
  $Rad = $s * 0.40; $bw = $s * 0.052
  for ($i = 0; $i -lt 6; $i++) {
    $pen = New-Object System.Drawing.Pen((C $RAINBOW[$i]), [single]($bw + 0.6))
    $ra = $Rad - ($i + 0.5) * $bw
    $g.DrawArc($pen, [single]($cx - $ra), [single]($cy - $ra), [single]($ra * 2), [single]($ra * 2), [single]180, [single]180)
    $pen.Dispose()
  }
  # 虹のふもとを雲で隠す（白い丸を重ねる）
  $cloud = New-Object System.Drawing.SolidBrush((C ($(if ($night) { '#F4F1FA' } else { '#FFFFFF' }))))
  foreach ($side in @(-1, 1)) {
    $bx = $cx + $side * ($Rad - 3 * $bw)
    foreach ($c in @(@(-0.07, 0.0, 0.075), @(0.0, -0.035, 0.085), @(0.075, 0.005, 0.07))) {
      $rr = $s * $c[2]
      $x = $bx + $s * $c[0] * $side; $y = $cy + $s * $c[1]
      $g.FillEllipse($cloud, [single]($x - $rr), [single]($y - $rr), [single]($rr * 2), [single]($rr * 2))
    }
  }
  $cloud.Dispose()
  # 大きな星（虹の上）
  $star = New-Object System.Drawing.SolidBrush((C '#F7B21B'))
  $sp = StarPath ($cx) ($ox + $s * 0.34) ($s * 0.17) 0.46 5
  $g.FillPath($star, $sp)
  if ($size -ge 128) {
    $hl = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(90, 255, 255, 255))
    $g.FillPath($hl, (StarPath ($cx - $s * 0.025) ($ox + $s * 0.325) ($s * 0.07) 0.46 5))
    $hl.Dispose()
  }
  # きらめき
  $sparkle = New-Object System.Drawing.SolidBrush((C ($(if ($night) { '#FFE69A' } else { '#F7B21B' }))))
  $g.FillPath($sparkle, (StarPath ($ox + $s * 0.20) ($ox + $s * 0.24) ($s * 0.06) 0.3 4))
  $g.FillPath($sparkle, (StarPath ($ox + $s * 0.80) ($ox + $s * 0.30) ($s * 0.045) 0.3 4))
  if ($night) { $g.FillPath($sparkle, (StarPath ($ox + $s * 0.70) ($ox + $s * 0.13) ($s * 0.03) 0.3 4)) }
  $star.Dispose(); $sparkle.Dispose()
}

function New-Icon([int]$size, [string]$path, [bool]$square, [string]$variant = 'day', [single]$scale = 1.0) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $shape = if ($square) { $null } else { RoundRect 0 0 $size $size ([int]($size * 0.22)) }
  if ($variant -eq 'night') {
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.Point(0, 0)), (New-Object System.Drawing.Point(0, $size)), (C '#1E2B5C'), (C '#3B3F86'))
  } else {
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.Point(0, 0)), (New-Object System.Drawing.Point(0, $size)), (C '#FFFFFF'), (C '#FFF3EA'))
  }
  if ($square) { $g.FillRectangle($bg, 0, 0, $size, $size) } else { $g.FillPath($bg, $shape) }
  Draw-Icon $g ([single]$size) $variant $scale
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $bg.Dispose()
}

if ($Preview) {
  New-Icon -size 256 -path (Join-Path $root "_preview-day.png") -square $false -variant 'day'
  New-Icon -size 256 -path (Join-Path $root "_preview-night.png") -square $false -variant 'night'
  Write-Host "Preview generated"
  return
}

$v = 'night'
New-Icon -size 192 -path (Join-Path $root "icon-192.png") -square $false -variant $v
New-Icon -size 512 -path (Join-Path $root "icon-512.png") -square $false -variant $v
New-Icon -size 512 -path (Join-Path $root "icon-maskable-512.png") -square $true -variant $v -scale 0.8
New-Icon -size 180 -path (Join-Path $root "icon-180.png") -square $true -variant $v
New-Icon -size 32  -path (Join-Path $root "favicon-32.png") -square $false -variant $v

# ほかに選べる「白い空」の版（設定 → ホーム画面のアイコン）
New-Icon -size 180 -path (Join-Path $root "day-180.png") -square $true -variant 'day'
New-Icon -size 192 -path (Join-Path $root "day-192.png") -square $false -variant 'day'

Write-Host "Icons generated in $root"
