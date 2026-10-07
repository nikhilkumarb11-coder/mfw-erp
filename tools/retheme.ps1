# Re-colours the Sneat CSS for this app and copies it into css/vendor/.
#
# Usage (from the app folder):
#   powershell -ExecutionPolicy Bypass -File tools\retheme.ps1
#   powershell -ExecutionPolicy Bypass -File tools\retheme.ps1 -Primary "#c2185b"
#
# Every shade of Sneat's purple (#696cff family) is moved to the new primary hue,
# keeping its relative lightness, and Sneat's orange-red "danger" is moved to a
# true red so it doesn't clash with an orange primary.

param(
  [string]$Primary = "#ea580c",
  [string]$Danger  = "#dc2626",
  [string]$Source  = "$PSScriptRoot\..\..\sneat-1.0.0\sneat-1.0.0\assets\vendor\css",
  [string]$Dest    = "$PSScriptRoot\..\css\vendor"
)

$ErrorActionPreference = "Stop"

function ConvertTo-Hsl([int]$r, [int]$g, [int]$b) {
  $rf = $r / 255.0; $gf = $g / 255.0; $bf = $b / 255.0
  $max = [Math]::Max($rf, [Math]::Max($gf, $bf)); $min = [Math]::Min($rf, [Math]::Min($gf, $bf))
  $l = ($max + $min) / 2; $d = $max - $min
  if ($d -eq 0) { return @(0.0, 0.0, $l) }
  $s = $d / (1 - [Math]::Abs(2 * $l - 1))
  if ($max -eq $rf) { $h = 60 * ((($gf - $bf) / $d) % 6) }
  elseif ($max -eq $gf) { $h = 60 * ((($bf - $rf) / $d) + 2) }
  else { $h = 60 * ((($rf - $gf) / $d) + 4) }
  if ($h -lt 0) { $h += 360 }
  return @($h, $s, $l)
}

function ConvertFrom-Hsl([double]$h, [double]$s, [double]$l) {
  $c = (1 - [Math]::Abs(2 * $l - 1)) * $s
  $x = $c * (1 - [Math]::Abs((($h / 60) % 2) - 1))
  $m = $l - $c / 2
  switch ([Math]::Floor($h / 60)) {
    0 { $r1 = $c; $g1 = $x; $b1 = 0 }
    1 { $r1 = $x; $g1 = $c; $b1 = 0 }
    2 { $r1 = 0; $g1 = $c; $b1 = $x }
    3 { $r1 = 0; $g1 = $x; $b1 = $c }
    4 { $r1 = $x; $g1 = 0; $b1 = $c }
    default { $r1 = $c; $g1 = 0; $b1 = $x }
  }
  return @(
    [int][Math]::Round(($r1 + $m) * 255),
    [int][Math]::Round(($g1 + $m) * 255),
    [int][Math]::Round(($b1 + $m) * 255)
  )
}

function Get-Rgb([string]$hex) {
  return @([convert]::ToInt32($hex.Substring(1, 2), 16), [convert]::ToInt32($hex.Substring(3, 2), 16), [convert]::ToInt32($hex.Substring(5, 2), 16))
}

# A colour "family": source base colour, hue window that identifies it, target base colour.
function New-Family([string]$from, [double]$hueMin, [double]$hueMax, [string]$to) {
  $f = Get-Rgb $from; $t = Get-Rgb $to
  return @{ From = (ConvertTo-Hsl $f[0] $f[1] $f[2]); To = (ConvertTo-Hsl $t[0] $t[1] $t[2]); HueMin = $hueMin; HueMax = $hueMax }
}

$families = @(
  (New-Family "#696cff" 225 245 $Primary),
  (New-Family "#ff3e1d" 5 12 $Danger)
)

function Convert-Rgb([int]$r, [int]$g, [int]$b) {
  $hsl = ConvertTo-Hsl $r $g $b
  foreach ($fam in $families) {
    if ($hsl[1] -lt 0.5 -or $hsl[0] -lt $fam.HueMin -or $hsl[0] -gt $fam.HueMax) { continue }
    $l0 = $fam.From[2]; $l1 = $fam.To[2]
    if ($hsl[2] -le $l0) { $nl = $hsl[2] * $l1 / $l0 } else { $nl = $l1 + ($hsl[2] - $l0) * (1 - $l1) / (1 - $l0) }
    $ns = [Math]::Min(1.0, $hsl[1] * $fam.To[1] / [Math]::Max(0.01, $fam.From[1]))
    return (ConvertFrom-Hsl $fam.To[0] $ns $nl)
  }
  return $null
}

$hexEval = [System.Text.RegularExpressions.MatchEvaluator] {
  param($m)
  $c = Get-Rgb $m.Value
  $n = Convert-Rgb $c[0] $c[1] $c[2]
  if ($null -eq $n) { return $m.Value }
  return ('#{0:x2}{1:x2}{2:x2}' -f $n[0], $n[1], $n[2])
}

$rgbEval = [System.Text.RegularExpressions.MatchEvaluator] {
  param($m)
  $n = Convert-Rgb ([int]$m.Groups[2].Value) ([int]$m.Groups[3].Value) ([int]$m.Groups[4].Value)
  if ($null -eq $n) { return $m.Value }
  return ('{0}({1}, {2}, {3}' -f $m.Groups[1].Value, $n[0], $n[1], $n[2])
}

# Same colours inside url-encoded SVGs (%23696cff)
$svgEval = [System.Text.RegularExpressions.MatchEvaluator] {
  param($m)
  $c = Get-Rgb ('#' + $m.Groups[1].Value)
  $n = Convert-Rgb $c[0] $c[1] $c[2]
  if ($null -eq $n) { return $m.Value }
  return ('%23{0:x2}{1:x2}{2:x2}' -f $n[0], $n[1], $n[2])
}

New-Item -ItemType Directory -Force -Path $Dest | Out-Null

foreach ($pair in @(@("core.css", "core.css"), @("theme-default.css", "theme.css"))) {
  $css = [System.IO.File]::ReadAllText((Join-Path $Source $pair[0]))
  $css = [regex]::Replace($css, '/\*# sourceMappingURL=[^*]*\*/', '')
  $css = [regex]::Replace($css, '(?<![0-9a-zA-Z%])#[0-9a-fA-F]{6}\b', $hexEval)
  $css = [regex]::Replace($css, '%23([0-9a-fA-F]{6})\b', $svgEval)
  $css = [regex]::Replace($css, '(rgba?)\(\s*(\d+),\s*(\d+),\s*(\d+)', $rgbEval)
  [System.IO.File]::WriteAllText((Join-Path $Dest $pair[1]), $css, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host ("Wrote {0} ({1:N0} KB)" -f $pair[1], ((Get-Item (Join-Path $Dest $pair[1])).Length / 1KB))
}
