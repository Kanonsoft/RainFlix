param([switch]$SkipBuild, [switch]$EmergencyExit, [switch]$RenderOnly)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$binary = Join-Path $projectRoot 'src-tauri/target/release/rainflix.exe'
$fixture = Join-Path $projectRoot 'tests/fixtures/player-sample.mp4'
$output = Join-Path ([System.IO.Path]::GetTempPath()) 'rainflix-native-player-smoke'
New-Item -ItemType Directory -Path $output -Force | Out-Null
Remove-Item -LiteralPath (Join-Path $output 'preload.json') -Force -ErrorAction SilentlyContinue
if (-not $SkipBuild) {
    & cargo build --release --features native-player-smoke --manifest-path (Join-Path $projectRoot 'src-tauri/Cargo.toml')
    if ($LASTEXITCODE -ne 0) { throw 'Native smoke build failed.' }
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'src-tauri/player/rainflix_ui.lua') -Destination (Join-Path $projectRoot 'src-tauri/target/release/mpv/rainflix_ui.lua') -Force

Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class RainFlixSmokeWindows {
    public delegate bool EnumWindowProc(IntPtr hwnd, IntPtr data);
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hwnd, EnumWindowProc callback, IntPtr data);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
    [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool EnableWindow(IntPtr hwnd, bool enabled);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int command);
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
    [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
    [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr window);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [StructLayout(LayoutKind.Sequential)] public struct GuiThreadInfo {
        public uint size, flags;
        public IntPtr active, focus, capture, menuOwner, moveSize, caret;
        public Rect caretRect;
    }
    [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint thread, ref GuiThreadInfo info);
    [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint key, uint mapType);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint from, uint to, bool attach);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
}
'@

$oldMedia = $env:RAINFLIX_NATIVE_SMOKE_MEDIA
$appProcess = $null
$pipe = $null
$writer = $null
$reader = $null
try {
    $env:RAINFLIX_NATIVE_SMOKE_MEDIA = $fixture
    $appProcess = Start-Process -FilePath $binary -WindowStyle Hidden -PassThru
    $pipe = [System.IO.Pipes.NamedPipeClientStream]::new('.', 'rainflix-native-smoke', [System.IO.Pipes.PipeDirection]::InOut)
    $pipe.Connect(30000)
    $writer = [System.IO.StreamWriter]::new($pipe, [System.Text.UTF8Encoding]::new($false), 1024, $true)
    $writer.AutoFlush = $true
    $reader = [System.IO.StreamReader]::new($pipe, [System.Text.Encoding]::UTF8, $false, 1024, $true)
    $script:requestId = 0
    function Invoke-PlayerCommand([object[]]$Command, [switch]$AllowUnavailable) {
        $script:requestId++
        $writer.WriteLine((@{ command = $Command; request_id = $script:requestId } | ConvertTo-Json -Depth 8 -Compress))
        while ($true) {
            $read = $reader.ReadLineAsync()
            if (-not $read.Wait(5000)) { throw 'mpv IPC response timed out.' }
            if ($null -eq $read.Result) { throw 'mpv IPC disconnected.' }
            $response = $read.Result | ConvertFrom-Json
            if ($response.request_id -eq $script:requestId) {
                if ($AllowUnavailable -and $response.error -eq 'property unavailable') { return $null }
                if ($response.error -ne 'success') { throw "mpv command $($Command -join ' ') failed: $($response.error)" }
                return $response.data
            }
        }
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
        Start-Sleep -Milliseconds 100
        $ready = Invoke-PlayerCommand @('get_property', 'video-params') -AllowUnavailable
    } while (-not $ready -and [DateTime]::UtcNow -lt $deadline)
    if (-not $ready) { throw 'mpv did not render the local video.' }
    Start-Sleep -Milliseconds 800
    $appProcess.Refresh()
    $mainWindow = $appProcess.MainWindowHandle
    if ($mainWindow -eq [IntPtr]::Zero) { throw 'RainFlix has no main window.' }
    $parent = Invoke-PlayerCommand @('get_property', 'options/wid')
    if ([uint64]$parent -ne ([uint64]$mainWindow.ToInt64() -band 0xffffffff)) { throw 'mpv is not attached to RainFlix.' }
    $nativeProcess = Get-CimInstance Win32_Process -Filter "name = 'mpv.exe'" |
        Where-Object { $_.ParentProcessId -eq $appProcess.Id } | Select-Object -First 1
    if (-not $nativeProcess) { throw 'RainFlix has no child mpv process.' }
    $script:visiblePlayer = $false
    $callback = [RainFlixSmokeWindows+EnumWindowProc] {
        param($hwnd, $data)
        [uint32]$owner = 0
        [RainFlixSmokeWindows]::GetWindowThreadProcessId($hwnd, [ref]$owner) | Out-Null
        if ($owner -eq $nativeProcess.ProcessId -and [RainFlixSmokeWindows]::IsWindowVisible($hwnd)) {
            $script:visiblePlayer = $true
            $script:playerWindow = $hwnd
        }
        return $true
    }
    [RainFlixSmokeWindows]::EnumChildWindows($mainWindow, $callback, [IntPtr]::Zero) | Out-Null
    if (-not $script:visiblePlayer) { throw 'Embedded mpv video window is not visible.' }
    if (-not [RainFlixSmokeWindows]::IsWindowEnabled($script:playerWindow)) { throw 'Embedded mpv input window is disabled.' }
    [RainFlixSmokeWindows]::ShowWindow($mainWindow, 9) | Out-Null
    if (-not $RenderOnly) { [RainFlixSmokeWindows]::SetForegroundWindow($mainWindow) | Out-Null }
    # Reproduce mpv disabling the child after RainFlix's initial handoff.
    [RainFlixSmokeWindows]::EnableWindow($script:playerWindow, $false) | Out-Null
    Start-Sleep -Milliseconds 800
    if (-not [RainFlixSmokeWindows]::IsWindowEnabled($script:playerWindow)) { throw 'Late-disabled mpv input was not repaired.' }
    $playerBounds = [RainFlixSmokeWindows+Rect]::new()
    [RainFlixSmokeWindows]::GetWindowRect($script:playerWindow, [ref]$playerBounds) | Out-Null
    $dimensions = Invoke-PlayerCommand @('get_property', 'osd-dimensions')
    function Move-PlayerMouse([double]$X, [double]$Y) {
        [RainFlixSmokeWindows]::SetForegroundWindow($mainWindow) | Out-Null
        [RainFlixSmokeWindows]::GetWindowRect($script:playerWindow, [ref]$playerBounds) | Out-Null
        $screenX = $playerBounds.Left + [int]($X * ($playerBounds.Right - $playerBounds.Left) / $dimensions.w)
        $screenY = $playerBounds.Top + [int]($Y * ($playerBounds.Bottom - $playerBounds.Top) / $dimensions.h)
        [RainFlixSmokeWindows]::SetCursorPos($screenX, $screenY) | Out-Null
        Start-Sleep -Milliseconds 200
        $point = [RainFlixSmokeWindows+Point]::new()
        $point.X = $screenX; $point.Y = $screenY
        $target = [RainFlixSmokeWindows]::WindowFromPoint($point)
        if ($target -ne $script:playerWindow) {
            [uint32]$targetOwner = 0
            [RainFlixSmokeWindows]::GetWindowThreadProcessId($target, [ref]$targetOwner) | Out-Null
            if ($targetOwner -eq $nativeProcess.ProcessId) { $script:playerWindow = $target }
            else { throw "Mouse targets $target (process $targetOwner) instead of mpv $($script:playerWindow) at $screenX,$screenY." }
        }
    }
    function Click-Player([double]$X, [double]$Y) {
        Move-PlayerMouse $X $Y
        [RainFlixSmokeWindows]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
        [RainFlixSmokeWindows]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds 200
    }
    function Press-PlayerKey([byte]$Key) {
        [byte]$scan = [RainFlixSmokeWindows]::MapVirtualKey($Key, 0)
        [uint32]$flags = if ($Key -in @(33,34,35,36,37,38,39,40,45,46)) { 1 } else { 0 }
        [RainFlixSmokeWindows]::keybd_event($Key, $scan, $flags, [UIntPtr]::Zero)
        [RainFlixSmokeWindows]::keybd_event($Key, $scan, ($flags -bor 2), [UIntPtr]::Zero)
        Start-Sleep -Milliseconds 150
    }
    if ($RenderOnly) {
        # Force focus onto the enabled parent, then verify native recovery without a mouse click.
        [RainFlixSmokeWindows]::SetForegroundWindow($mainWindow) | Out-Null
        [uint32]$owner = 0
        $parentThread = [RainFlixSmokeWindows]::GetWindowThreadProcessId($mainWindow, [ref]$owner)
        $currentThread = [RainFlixSmokeWindows]::GetCurrentThreadId()
        $attached = [RainFlixSmokeWindows]::AttachThreadInput($currentThread, $parentThread, $true)
        try { [RainFlixSmokeWindows]::SetFocus($mainWindow) | Out-Null }
        finally { if ($attached) { [RainFlixSmokeWindows]::AttachThreadInput($currentThread, $parentThread, $false) | Out-Null } }
        Start-Sleep -Milliseconds 600
        Press-PlayerKey 32
        if (Invoke-PlayerCommand @('get_property','pause')) {
            $focusInfo = [RainFlixSmokeWindows+GuiThreadInfo]::new()
            $focusInfo.size = [System.Runtime.InteropServices.Marshal]::SizeOf($focusInfo)
            [RainFlixSmokeWindows]::GetGUIThreadInfo(0, [ref]$focusInfo) | Out-Null
            throw "Real Space did not reach the player: foreground=$([RainFlixSmokeWindows]::GetForegroundWindow()), main=$mainWindow, focus=$($focusInfo.focus), mpv=$script:playerWindow."
        }
        Press-PlayerKey 32
        if (-not (Invoke-PlayerCommand @('get_property','pause'))) { throw 'Real Space did not pause again.' }
        Invoke-PlayerCommand @('set_property','volume',50) | Out-Null
        Press-PlayerKey 38
        if ((Invoke-PlayerCommand @('get_property','volume')) -ne 55) { throw 'Real Up did not reach the embedded volume shortcut.' }
        Invoke-PlayerCommand @('keypress','SPACE') | Out-Null
        Start-Sleep -Milliseconds 100
        if (Invoke-PlayerCommand @('get_property','pause')) { throw 'Space shortcut did not play.' }
        Invoke-PlayerCommand @('keypress','k') | Out-Null
        Start-Sleep -Milliseconds 100
        if (-not (Invoke-PlayerCommand @('get_property','pause'))) { throw 'K shortcut did not pause.' }
        Invoke-PlayerCommand @('set_property','volume',50) | Out-Null
        Invoke-PlayerCommand @('keypress','UP') | Out-Null
        Start-Sleep -Milliseconds 100
        if ((Invoke-PlayerCommand @('get_property','volume')) -ne 55) { throw 'Up shortcut did not raise volume.' }
        Invoke-PlayerCommand @('keypress','DOWN') | Out-Null
        Invoke-PlayerCommand @('keypress','m') | Out-Null
        Invoke-PlayerCommand @('keypress',']') | Out-Null
        Start-Sleep -Milliseconds 100
        if ((Invoke-PlayerCommand @('get_property','volume')) -ne 50 -or -not (Invoke-PlayerCommand @('get_property','mute')) -or (Invoke-PlayerCommand @('get_property','speed')) -ne 1.25) { throw 'Volume, mute or speed shortcuts failed.' }
        Invoke-PlayerCommand @('keypress','m') | Out-Null
        Invoke-PlayerCommand @('keypress','BS') | Out-Null
        # The fixture is only three seconds long; forward ten seconds would reach EOF.
        $bindings = Invoke-PlayerCommand @('get_property','input-bindings')
        foreach ($name in @('rainflix-seek-forward','rainflix-next-n','rainflix-prev-p')) {
            if (-not ($bindings | Where-Object { $_.cmd -like "*$name*" })) { throw "Shortcut $name was not registered." }
        }
        Invoke-PlayerCommand @('seek',1.5,'absolute+exact') | Out-Null
        Start-Sleep -Milliseconds 200
        $seekPosition = Invoke-PlayerCommand @('get_property','time-pos')
        Invoke-PlayerCommand @('keypress','a') | Out-Null
        Invoke-PlayerCommand @('keypress','LEFT') | Out-Null
        Start-Sleep -Milliseconds 100
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        if ($state.panel -ne 'audio' -or [Math]::Abs((Invoke-PlayerCommand @('get_property','time-pos')) - $seekPosition) -gt 0.5) { throw 'Menu arrows sought underneath the popup.' }
        Invoke-PlayerCommand @('keypress','ESC') | Out-Null
        Invoke-PlayerCommand @('keypress','LEFT') | Out-Null
        Start-Sleep -Milliseconds 200
        if ((Invoke-PlayerCommand @('get_property','time-pos')) -gt 2) { throw 'Left shortcut did not seek back.' }
        Invoke-PlayerCommand @('screenshot-to-file',(Join-Path $output 'paused.png'),'window') | Out-Null
        Invoke-PlayerCommand @('sub-add',(Join-Path $projectRoot 'tests/fixtures/native-english.srt'),'select','English','eng') | Out-Null
        Invoke-PlayerCommand @('sub-add',(Join-Path $projectRoot 'tests/fixtures/native-chinese.srt'),'auto','Chinese','ZH-HANS') | Out-Null
        Invoke-PlayerCommand @('sub-add',(Join-Path $projectRoot 'tests/fixtures/native-english.srt'),'auto','English alternate','en') | Out-Null
        Invoke-PlayerCommand @('script-message','rainflix-smoke-subtitle-language','English') | Out-Null
        Start-Sleep -Milliseconds 200
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        if ($state.subtitleLanguage -ne 'English' -or $state.subtitleVariants -ne 2) { throw 'English aliases were not grouped with both variants.' }
        Invoke-PlayerCommand @('screenshot-to-file',(Join-Path $output 'subtitle-variants.png'),'window') | Out-Null
        Invoke-PlayerCommand @('script-message','rainflix-smoke-subtitle-language','') | Out-Null
        foreach ($menu in @('subtitles','subtitle-settings','audio','episodes','settings')) {
            Invoke-PlayerCommand @('script-message','rainflix-smoke-panel',$menu,'1') | Out-Null
            Start-Sleep -Milliseconds 250
            $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
            if ($state.panel -ne $menu) { throw "Native $menu panel did not render." }
            Invoke-PlayerCommand @('screenshot-to-file',(Join-Path $output "$menu.png"),'window') | Out-Null
        }
        Invoke-PlayerCommand @('script-message','rainflix-smoke-panel','episodes','2') | Out-Null
        Start-Sleep -Milliseconds 250
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        if ($state.season -ne 2) { throw 'Native season did not change.' }
        $uploads = $state.bitmapUploads
        Start-Sleep -Milliseconds 650
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        if ($state.bitmapUploads -ne $uploads) { throw 'Unchanged episode thumbnails were uploaded again.' }
        Invoke-PlayerCommand @('script-message','rainflix-smoke-panel','streams','2') | Out-Null
        Start-Sleep -Milliseconds 250
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        if ($state.panel -ne 'streams' -or $state.streamCount -ne 3 -or $state.streamItemCount -ne 2) { throw 'In-player providers did not render.' }
        Invoke-PlayerCommand @('script-message','rainflix-smoke-provider','torrentio') | Out-Null
        Start-Sleep -Milliseconds 150
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        if ($state.streamProvider -ne 'torrentio' -or $state.streamItemCount -ne 2) { throw 'Torrentio streams were not filtered by provider.' }
        Invoke-PlayerCommand @('screenshot-to-file',(Join-Path $output 'stream-details.png'),'window') | Out-Null
        Invoke-PlayerCommand @('keypress','DOWN') | Out-Null
        Start-Sleep -Milliseconds 150
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        if ($state.streamOffset -le 0) { throw 'Long stream details did not scroll.' }
        Invoke-PlayerCommand @('script-message','rainflix-smoke-provider','yastream') | Out-Null
        Start-Sleep -Milliseconds 150
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        if ($state.streamItemCount -ne 1) { throw 'Yastream included streams from another provider.' }
        Invoke-PlayerCommand @('script-message','rainflix-smoke-provider','back') | Out-Null
        Start-Sleep -Milliseconds 150
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        if ($state.streamProvider -or $state.streamItemCount -ne 2) { throw 'Returning to providers did not reset the sidebar.' }
        Invoke-PlayerCommand @('screenshot-to-file',(Join-Path $output 'streams.png'),'window') | Out-Null
        Invoke-PlayerCommand @('script-message','rainflix-smoke-long-series') | Out-Null
        Start-Sleep -Milliseconds 250
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        if ($state.season -ne 23 -or $state.episodeCount -ne 2) { throw 'Late-season episode rows were missing in the native drawer.' }
        Invoke-PlayerCommand @('screenshot-to-file',(Join-Path $output 'late-season.png'),'window') | Out-Null
        Invoke-PlayerCommand @('script-message','rainflix-smoke-panel','episodes','1') | Out-Null
        Invoke-PlayerCommand @('keypress','DOWN') | Out-Null
        Start-Sleep -Milliseconds 150
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        if ($state.episodeOffset -ne 1) { throw 'Episode drawer did not scroll one row.' }
        Invoke-PlayerCommand @('script-message','rainflix-smoke-current-episode','smoke:1:500') | Out-Null
        Invoke-PlayerCommand @('script-message','rainflix-smoke-panel','none','23') | Out-Null
        Invoke-PlayerCommand @('keypress','e') | Out-Null
        Start-Sleep -Milliseconds 150
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        if ($state.season -ne 1 -or $state.episodeOffset -lt 490 -or $state.episodeOffset -gt 499) { throw 'Opening episodes did not center the playing episode.' }
        Invoke-PlayerCommand @('keypress','DOWN') | Out-Null
        Start-Sleep -Milliseconds 150
        $offset = (Invoke-PlayerCommand @('get_property','user-data/rainflix')).episodeOffset
        if ($offset -ne ($state.episodeOffset + 1)) { throw 'Manual episode scrolling did not move one row.' }
        Start-Sleep -Milliseconds 250
        if ((Invoke-PlayerCommand @('get_property','user-data/rainflix')).episodeOffset -ne $offset) { throw 'Episode drawer snapped back after manual scrolling.' }
        Invoke-PlayerCommand @('script-message','rainflix-smoke-current-episode','smoke:23:1') | Out-Null
        Invoke-PlayerCommand @('script-message','rainflix-smoke-panel','none','23') | Out-Null
        Invoke-PlayerCommand @('script-message','rainflix-smoke-skip-option','preload','no') | Out-Null
        Invoke-PlayerCommand @('seek',1.6,'absolute+exact') | Out-Null
        Invoke-PlayerCommand @('set_property','pause',$false) | Out-Null
        Start-Sleep -Milliseconds 80
        Invoke-PlayerCommand @('set_property','pause',$true) | Out-Null
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        if ($state.preloadVideo) { throw 'Preloading started while disabled.' }
        Invoke-PlayerCommand @('script-message','rainflix-smoke-skip-option','preload','yes') | Out-Null
        Invoke-PlayerCommand @('seek',0.6,'absolute+exact') | Out-Null
        Invoke-PlayerCommand @('set_property','pause',$false) | Out-Null
        Start-Sleep -Milliseconds 120
        Invoke-PlayerCommand @('set_property','pause',$true) | Out-Null
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        if ($state.preloadVideo -ne 'smoke:23:2') { throw 'Preloading did not start when playback became ready before 75%.' }
        Invoke-PlayerCommand @('script-message','rainflix-smoke-skip-option','preload','no') | Out-Null
        Start-Sleep -Milliseconds 150
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        if ($state.preloadVideo) { throw 'Disabling preloading did not cancel it.' }
        Invoke-PlayerCommand @('seek',2.8,'absolute+exact') | Out-Null
        Start-Sleep -Milliseconds 250
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        if ($state.nextEpisode -ne 'smoke:23:2') { throw 'Next-episode preview did not appear near EOF.' }
        Invoke-PlayerCommand @('script-message','rainflix-smoke-skip-option','preload','yes') | Out-Null
        Invoke-PlayerCommand @('script-message','rainflix-smoke-preload-status','buffering','25') | Out-Null
        Start-Sleep -Milliseconds 150
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        if ($state.preloadStatus.status -ne 'buffering' -or $state.preloadStatus.percent -ne 25) { throw 'Measured next-episode preload progress is missing.' }
        Invoke-PlayerCommand @('screenshot-to-file',(Join-Path $output 'next-preload-buffering.png'),'window') | Out-Null
        Invoke-PlayerCommand @('script-message','rainflix-smoke-preload-status','ready','100') | Out-Null
        Invoke-PlayerCommand @('screenshot-to-file',(Join-Path $output 'next-episode.png'),'window') | Out-Null
        $previewImage = [System.Drawing.Bitmap]::new((Join-Path $output 'next-episode.png'))
        try {
            $pixel = $previewImage.GetPixel([int]($dimensions.w - 444), [int]($dimensions.h - 235))
            if ($pixel.B -lt 100 -or $pixel.G -lt 100 -or $pixel.R -gt 120) { throw 'Next-episode thumbnail pixels were not rendered.' }
        } finally { $previewImage.Dispose() }
        Invoke-PlayerCommand @('script-message','rainflix-smoke-skip-option','preview','no') | Out-Null
        Start-Sleep -Milliseconds 150
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        if ($state.nextEpisode) { throw 'Disabled next-episode preview remained visible.' }
        Invoke-PlayerCommand @('script-message','rainflix-smoke-skip-option','preview','yes') | Out-Null
        Invoke-PlayerCommand @('set_property','chapter-list',@(
            @{ time = 0; title = 'OP - Opening' },
            @{ time = 1; title = 'Story' },
            @{ time = 2; title = 'ED - Ending' }
            @{ time = 2.7; title = 'Post credits' }
        )) | Out-Null
        Invoke-PlayerCommand @('seek',0,'absolute+exact') | Out-Null
        Invoke-PlayerCommand @('script-message','rainflix-smoke-skip-option','intro','yes') | Out-Null
        Invoke-PlayerCommand @('set_property','pause',$false) | Out-Null
        Start-Sleep -Milliseconds 150
        Invoke-PlayerCommand @('set_property','pause',$true) | Out-Null
        if ((Invoke-PlayerCommand @('get_property','time-pos')) -lt 1) { throw 'Enabled intro skipping did not seek to story.' }
        Invoke-PlayerCommand @('script-message','rainflix-smoke-skip-option','intro','no') | Out-Null
        Invoke-PlayerCommand @('seek',0,'absolute+exact') | Out-Null
        Invoke-PlayerCommand @('set_property','pause',$false) | Out-Null
        Start-Sleep -Milliseconds 150
        Invoke-PlayerCommand @('set_property','pause',$true) | Out-Null
        if ((Invoke-PlayerCommand @('get_property','time-pos')) -ge 1) { throw 'Disabled intro skipping still skipped the opening.' }
        Invoke-PlayerCommand @('seek',2.2,'absolute+exact') | Out-Null
        Start-Sleep -Milliseconds 150
        Invoke-PlayerCommand @('screenshot-to-file',(Join-Path $output 'next-episode-skip.png'),'window') | Out-Null
        Invoke-PlayerCommand @('script-message','rainflix-smoke-skip-option','outro','yes') | Out-Null
        Invoke-PlayerCommand @('set_property','pause',$false) | Out-Null
        Start-Sleep -Milliseconds 80
        Invoke-PlayerCommand @('set_property','pause',$true) | Out-Null
        if ((Invoke-PlayerCommand @('get_property','time-pos')) -lt 2.7) { throw 'Enabled outro skipping did not reach the next chapter.' }
        Invoke-PlayerCommand @('script-message','rainflix-smoke-skip-option','outro','no') | Out-Null
        Invoke-PlayerCommand @('seek',2.05,'absolute+exact') | Out-Null
        Invoke-PlayerCommand @('set_property','pause',$false) | Out-Null
        Start-Sleep -Milliseconds 80
        Invoke-PlayerCommand @('set_property','pause',$true) | Out-Null
        if ((Invoke-PlayerCommand @('get_property','time-pos')) -ge 2.7) { throw 'Disabled outro skipping still skipped the ending.' }
        Invoke-PlayerCommand @('seek',0,'absolute+exact') | Out-Null
        Invoke-PlayerCommand @('script-message','rainflix-smoke-panel','seasons','23') | Out-Null
        Start-Sleep -Milliseconds 250
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        if ($state.panel -ne 'seasons') { throw 'Native season selection did not render.' }
        Invoke-PlayerCommand @('screenshot-to-file',(Join-Path $output 'seasons.png'),'window') | Out-Null
        Invoke-PlayerCommand @('script-message','rainflix-smoke-panel','none','1') | Out-Null
        Invoke-PlayerCommand @('script-message','rainflix-smoke-startup','yes') | Out-Null
        Invoke-PlayerCommand @('script-message','rainflix-smoke-buffer','yes','25') | Out-Null
        Start-Sleep -Milliseconds 250
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        if (-not $state.backdropVisible) { throw 'Initial loading did not show the title backdrop.' }
        Start-Sleep -Milliseconds 1500
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        $activity = $state.activityX
        $uploads = $state.bitmapUploads
        Start-Sleep -Milliseconds 500
        $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        if ($null -eq $state.activityX -or [Math]::Abs($state.activityX - $activity) -lt 1) { throw 'Startup buffering animation did not move.' }
        if ($state.bitmapUploads -gt ($uploads + 1)) { throw 'Startup animation repeatedly uploaded the logo.' }
        Invoke-PlayerCommand @('script-message','rainflix-smoke-startup','no') | Out-Null
        foreach ($percent in @(25,75)) {
            Invoke-PlayerCommand @('script-message','rainflix-smoke-buffer','yes',"$percent") | Out-Null
            Start-Sleep -Milliseconds 1100
            $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
            if (-not $state.buffering -or -not $state.logo -or $state.fill -gt $percent -or $state.fill -lt ($percent - 10)) { throw 'Native buffering did not match measured progress.' }
            if ($state.backdropVisible) { throw 'Rebuffering showed the startup backdrop again.' }
            Invoke-PlayerCommand @('screenshot-to-file',(Join-Path $output "buffer-$percent.png"),'window') | Out-Null
        }
        Invoke-PlayerCommand @('quit') | Out-Null
        Start-Sleep -Milliseconds 700
        if ($appProcess.HasExited) { throw 'Closing native playback also closed RainFlix.' }
        $preloadResult = Get-Content -LiteralPath (Join-Path $output 'preload.json') -Raw | ConvertFrom-Json
        if (-not $preloadResult.warmed -or -not $preloadResult.cancelled) { throw "Headless preload failed: $($preloadResult.error)" }
        Write-Output "Native render smoke passed: idle-to-video handoff, pause artwork, track popups, stable episode thumbnails, season update, stream drawer, measured logo fill and close. Real mouse controls were not exercised. Screenshots: $output"
        return
    }
    Start-Sleep -Seconds 5
    $dimensions = Invoke-PlayerCommand @('get_property', 'osd-dimensions')
    Move-PlayerMouse 250 250
    Start-Sleep -Milliseconds 300
    Invoke-PlayerCommand @('screenshot-to-file', (Join-Path $output 'mpv.png'), 'window') | Out-Null
    Click-Player 217 ($dimensions.h - 36)
    Start-Sleep -Milliseconds 150
    $volume = Invoke-PlayerCommand @('get_property', 'volume')
    if ([Math]::Abs($volume - 50) -gt 2) {
        $diagnostics = Invoke-PlayerCommand @('get_property','user-data/rainflix')
        throw "RainFlix volume control did not respond ($volume): $($diagnostics | ConvertTo-Json -Compress -Depth 5), dimensions=$($dimensions | ConvertTo-Json -Compress)"
    }
    Click-Player ($dimensions.w - 170) ($dimensions.h - 36)
    Start-Sleep -Milliseconds 150
    Invoke-PlayerCommand @('screenshot-to-file', (Join-Path $output 'speed-panel.png'), 'window') | Out-Null
    Click-Player ($dimensions.w - 139) ($dimensions.h - 180)
    Start-Sleep -Milliseconds 150
    $speed = Invoke-PlayerCommand @('get_property', 'speed')
    if ([Math]::Abs($speed - 1.5) -gt 0.01) { throw 'RainFlix speed control did not respond.' }
    Press-PlayerKey 27
    Click-Player 52 ($dimensions.h - 36)
    if (Invoke-PlayerCommand @('get_property', 'pause')) { throw 'Play button did not unpause.' }
    Press-PlayerKey 32
    if (-not (Invoke-PlayerCommand @('get_property', 'pause'))) { throw 'Space did not pause.' }
    Click-Player ($dimensions.w / 2) ($dimensions.h - 75)
    $duration = Invoke-PlayerCommand @('get_property', 'duration')
    $position = Invoke-PlayerCommand @('get_property', 'time-pos')
    if ([Math]::Abs($position - $duration / 2) -gt 1) { throw 'Seek bar did not seek to the midpoint.' }
    Invoke-PlayerCommand @('set_property','chapter-list',@(
        @{ time = 0; title = 'OP - Opening' },
        @{ time = $duration / 3; title = 'Story' },
        @{ time = $duration * 2 / 3; title = 'ED - Ending' }
    )) | Out-Null
    Invoke-PlayerCommand @('seek',0,'absolute+exact') | Out-Null
    Start-Sleep -Milliseconds 400
    $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
    if ($state.skip.title -ne 'Skip intro') { throw 'Opening chapter was not recognized.' }
    Invoke-PlayerCommand @('screenshot-to-file',(Join-Path $output 'skip-intro.png'),'window') | Out-Null
    Click-Player ($dimensions.w - 126) ($dimensions.h - 162)
    $position = Invoke-PlayerCommand @('get_property','time-pos')
    if ([Math]::Abs($position - $duration / 3) -gt 0.25) { throw 'Skip intro did not seek to the next chapter.' }
    $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
    if ($state.skip) { throw 'Ordinary story chapter incorrectly shows a skip prompt.' }
    Invoke-PlayerCommand @('seek',($duration * 2 / 3),'absolute+exact') | Out-Null
    Start-Sleep -Milliseconds 250
    $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
    if ($state.skip.title -ne 'Skip ending') { throw 'Ending chapter was not recognized.' }
    Invoke-PlayerCommand @('script-message','rainflix-smoke-buffer','yes','25') | Out-Null
    Start-Sleep -Milliseconds 900
    $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
    if (-not $state.buffering -or -not $state.logo -or $state.fill -gt 25 -or $state.fill -lt 15) { throw 'Native logo did not show measured 25% buffering.' }
    Invoke-PlayerCommand @('screenshot-to-file',(Join-Path $output 'buffer-25.png'),'window') | Out-Null
    Invoke-PlayerCommand @('script-message','rainflix-smoke-buffer','yes','75') | Out-Null
    Start-Sleep -Milliseconds 1100
    $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
    if ($state.fill -gt 75 -or $state.fill -lt 65) { throw 'Native logo did not fill to measured 75% buffering.' }
    Invoke-PlayerCommand @('screenshot-to-file',(Join-Path $output 'buffer-75.png'),'window') | Out-Null
    Invoke-PlayerCommand @('script-message','rainflix-smoke-buffer','clear','0') | Out-Null
    Start-Sleep -Milliseconds 250
    $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
    if ($state.buffering) { throw 'Buffering logo remained after readiness returned.' }
    Invoke-PlayerCommand @('sub-add',(Join-Path $projectRoot 'tests/fixtures/native-english.srt'),'select','English','eng') | Out-Null
    Invoke-PlayerCommand @('sub-add',(Join-Path $projectRoot 'tests/fixtures/native-chinese.srt'),'auto','Chinese','ZH-HANS') | Out-Null
    Click-Player ($dimensions.w - 114) ($dimensions.h - 36)
    Start-Sleep -Milliseconds 250
    $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
    if ($state.panel -ne 'subtitles' -or $state.languages -notcontains 'English' -or $state.languages -notcontains 'Chinese (Simplified)') { throw 'Subtitle menu did not translate language codes.' }
    Invoke-PlayerCommand @('screenshot-to-file',(Join-Path $output 'subtitles.png'),'window') | Out-Null
    $popupWidth = [Math]::Min(420,$dimensions.w - 48)
    $modalX = $dimensions.w - $popupWidth - 30
    $modalY = $dimensions.h - (106 + 3 * 60) - 106
    Click-Player ($modalX + 120) ($modalY + 58 + 60 + 27)
    Start-Sleep -Milliseconds 150
    $state = Invoke-PlayerCommand @('get_property','user-data/rainflix')
    if ($state.subtitleLanguage -ne 'Chinese (Simplified)') { throw 'Subtitle language did not open its variants.' }
    $variantY = $dimensions.h - (106 + 60 + 28) - 106
    Click-Player ($modalX + 120) ($variantY + 86 + 27)
    $tracks = Invoke-PlayerCommand @('get_property','track-list')
    $selected = $tracks | Where-Object { $_.type -eq 'sub' -and $_.selected }
    if ($selected.lang -ne 'ZH-HANS') { throw 'Selecting a subtitle variant did not activate its track.' }
    [RainFlixSmokeWindows]::SetForegroundWindow($mainWindow) | Out-Null
    Start-Sleep -Milliseconds 300
    $bounds = [RainFlixSmokeWindows+Rect]::new()
    [RainFlixSmokeWindows]::GetWindowRect($mainWindow, [ref]$bounds) | Out-Null
    $bitmap = [System.Drawing.Bitmap]::new($bounds.Right - $bounds.Left, $bounds.Bottom - $bounds.Top)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bitmap.Size)
        $bitmap.Save((Join-Path $output 'rainflix-window.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
    if ($EmergencyExit) {
        [RainFlixSmokeWindows]::keybd_event(17, 0, 0, [UIntPtr]::Zero)
        [RainFlixSmokeWindows]::keybd_event(8, 0, 0, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds 600
        [RainFlixSmokeWindows]::keybd_event(8, 0, 2, [UIntPtr]::Zero)
        [RainFlixSmokeWindows]::keybd_event(17, 0, 2, [UIntPtr]::Zero)
    } else {
        Click-Player 48 46
    }
    Start-Sleep -Milliseconds 700
    if ($appProcess.HasExited) { throw 'RainFlix exited when the player closed.' }
    if (Get-Process -Id $nativeProcess.ProcessId -ErrorAction SilentlyContinue) { throw 'Exit did not close native playback.' }
    Write-Output "Embedded player passed: input repair, real controls, chapter skip, compact subtitles, measured 25/75% native logo buffering, exit (emergency=$EmergencyExit). Screenshots: $output"
} finally {
    if ($reader) { $reader.Dispose() }
    if ($writer) { $writer.Dispose() }
    if ($pipe) { $pipe.Dispose() }
    $env:RAINFLIX_NATIVE_SMOKE_MEDIA = $oldMedia
    if ($appProcess -and -not $appProcess.HasExited) {
        $appProcess.CloseMainWindow() | Out-Null
        if (-not $appProcess.WaitForExit(5000)) { $appProcess.Kill() }
    }
}
