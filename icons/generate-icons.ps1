# またね アイコン生成（Node/Python不要、.NET System.Drawing のみ）
# 使い方: powershell -ExecutionPolicy Bypass -File icons/generate-icons.ps1
# 他の自作アプリと角丸の形・余白をそろえ、色と中の記号だけ変えている。
# 記号：白いカレンダーの真ん中にハート（＝ふたりで会う日）
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

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

$bg    = [System.Drawing.Color]::FromArgb(255, 0xFF, 0x9A, 0x52)   # --accent（あんず）
$paper = [System.Drawing.Color]::FromArgb(255, 0xFF, 0xFF, 0xFF)
$deep  = [System.Drawing.Color]::FromArgb(255, 0xC4, 0x56, 0x1A)   # --accent-deep
$heart = [System.Drawing.Color]::FromArgb(255, 0xF2, 0x5C, 0x6E)

function Draw-Symbol($g, [single]$size, [single]$scale) {
  $s  = $size * $scale
  $ox = ($size - $s) / 2
  # カレンダーの紙
  $cw = $s * 0.56; $ch = $s * 0.52
  $cx = $ox + ($s - $cw) / 2; $cy = $ox + $s * 0.27
  $paperBrush = New-Object System.Drawing.SolidBrush($paper)
  $g.FillPath($paperBrush, (RoundRect $cx $cy $cw $ch ($s * 0.07)))
  # 上の帯
  $bandBrush = New-Object System.Drawing.SolidBrush($deep)
  $band = New-Object System.Drawing.Drawing2D.GraphicsPath
  $r = $s * 0.07; $d = $r * 2; $bh = $ch * 0.24
  $band.AddArc($cx, $cy, $d, $d, 180, 90)
  $band.AddArc($cx + $cw - $d, $cy, $d, $d, 270, 90)
  $band.AddLine([single]($cx + $cw), [single]($cy + $bh), [single]$cx, [single]($cy + $bh))
  $band.CloseFigure()
  $g.FillPath($bandBrush, $band)
  # リング
  if ($size -ge 64) {
    $ringPen = New-Object System.Drawing.Pen($paper, [single]($s * 0.045))
    $ringPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $ringPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLine($ringPen, [single]($cx + $cw * 0.3), [single]($cy - $s * 0.045), [single]($cx + $cw * 0.3), [single]($cy + $bh * 0.55))
    $g.DrawLine($ringPen, [single]($cx + $cw * 0.7), [single]($cy - $s * 0.045), [single]($cx + $cw * 0.7), [single]($cy + $bh * 0.55))
    $ringPen.Dispose()
  }
  # ハート
  $hx = $cx + $cw / 2; $hy = $cy + $bh + ($ch - $bh) * 0.5; $hs = $s * 0.24
  $h = New-Object System.Drawing.Drawing2D.GraphicsPath
  $h.AddBezier([single]$hx, [single]($hy + 0.42 * $hs), [single]($hx - 0.12 * $hs), [single]($hy + 0.3 * $hs), [single]($hx - 0.6 * $hs), [single]($hy + 0.02 * $hs), [single]($hx - 0.6 * $hs), [single]($hy - 0.2 * $hs))
  $h.AddBezier([single]($hx - 0.6 * $hs), [single]($hy - 0.2 * $hs), [single]($hx - 0.6 * $hs), [single]($hy - 0.5 * $hs), [single]($hx - 0.25 * $hs), [single]($hy - 0.6 * $hs), [single]$hx, [single]($hy - 0.32 * $hs))
  $h.AddBezier([single]$hx, [single]($hy - 0.32 * $hs), [single]($hx + 0.25 * $hs), [single]($hy - 0.6 * $hs), [single]($hx + 0.6 * $hs), [single]($hy - 0.5 * $hs), [single]($hx + 0.6 * $hs), [single]($hy - 0.2 * $hs))
  $h.AddBezier([single]($hx + 0.6 * $hs), [single]($hy - 0.2 * $hs), [single]($hx + 0.6 * $hs), [single]($hy + 0.02 * $hs), [single]($hx + 0.12 * $hs), [single]($hy + 0.3 * $hs), [single]$hx, [single]($hy + 0.42 * $hs))
  $h.CloseFigure()
  $heartBrush = New-Object System.Drawing.SolidBrush($heart)
  $g.FillPath($heartBrush, $h)
  $paperBrush.Dispose(); $bandBrush.Dispose(); $heartBrush.Dispose()
}

function New-Icon([int]$size, [string]$path, [bool]$square, [single]$scale = 1.0) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $bgBrush = New-Object System.Drawing.SolidBrush($bg)
  if ($square) {
    $g.FillRectangle($bgBrush, 0, 0, $size, $size)
  } else {
    $g.FillPath($bgBrush, (RoundRect 0 0 $size $size ([int]($size * 0.22))))
  }
  Draw-Symbol $g ([single]$size) $scale
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

New-Icon -size 192 -path (Join-Path $root "icon-192.png") -square $false
New-Icon -size 512 -path (Join-Path $root "icon-512.png") -square $false
New-Icon -size 512 -path (Join-Path $root "icon-maskable-512.png") -square $true -scale 0.8
New-Icon -size 180 -path (Join-Path $root "icon-180.png") -square $true
New-Icon -size 32  -path (Join-Path $root "favicon-32.png") -square $false

Write-Host "Icons generated in $root"
