@echo off
setlocal enabledelayedexpansion

REM Hypermark Windows CMD Bootstrap Script

REM Parse command line arguments
set "VERSION=latest"
REM Tracks whether a version was explicitly set via --version or positional.
REM Used to reject mixing --version <tag> with a stray positional token.
set "VERSION_EXPLICIT=0"
REM Three-layer opt-in for SLSA provenance verification.
REM Precedence: CLI flag > env var > %USERPROFILE%\.hypermark\config.json > default.
REM -1 = flag not set (fall through); 0 = disable; 1 = enable.
set "VERIFY_ATTESTATION_FLAG=-1"
REM Opt-in install of the pruned CallDiff call-flow core (default off; the
REM review UI offers a one-click install). Precedence: --with-call-flow >
REM HYPERMARK_INSTALL_CALLDIFF > config installCallFlow > default (off).
REM -1 = flag not set (fall through); 1 = enable.
set "WITH_CALL_FLOW_FLAG=-1"
REM Guided-install answers. Precedence: CLI flags > wizard (interactive, first
REM run or --reconfigure) > saved prefs from a previous run > defaults.
set "EXTRAS_FLAG="
set "MODEL_INVOCABLE_FLAG="
set "NON_INTERACTIVE=0"
set "RECONFIGURE=0"
REM Binary-only mode. Installs just hypermark.exe and no persistent state
REM elsewhere. Set by --minimal (1) / --no-minimal (0); -1 = neither flag given
REM (fall through to the HYPERMARK_MINIMAL env var, resolved after :args_done).
set "MINIMAL_FLAG=-1"
REM Same shape, but scoped to the skills/slash-command sparse checkout rather
REM than one agent's home: --skip-skills turns the whole fetch into a no-op for
REM every scope it writes (Claude, .agents), including
REM the extras and the skill-scope cleanup sweeps.
set "SKIP_SKILLS_FLAG=0"

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--version" (
    if "%~2"=="" (
        echo --version requires an argument >&2
        exit /b 1
    )
    REM Reject dash-prefixed values - prevents `install.cmd --version
    REM --skip-attestation` from silently setting VERSION=--skip-attestation.
    set "NEXT_ARG=%~2"
    if "!NEXT_ARG:~0,1!"=="-" (
        echo --version requires a tag value, got flag: "%~2" >&2
        exit /b 1
    )
    set "VERSION=%~2"
    set "VERSION_EXPLICIT=1"
    shift
    shift
    goto parse_args
)
if /i "%~1"=="--verify-attestation" (
    if "!VERIFY_ATTESTATION_FLAG!"=="0" (
        echo --verify-attestation and --skip-attestation are mutually exclusive >&2
        exit /b 1
    )
    set "VERIFY_ATTESTATION_FLAG=1"
    shift
    goto parse_args
)
if /i "%~1"=="--skip-attestation" (
    if "!VERIFY_ATTESTATION_FLAG!"=="1" (
        echo --skip-attestation and --verify-attestation are mutually exclusive >&2
        exit /b 1
    )
    set "VERIFY_ATTESTATION_FLAG=0"
    shift
    goto parse_args
)
if /i "%~1"=="--with-call-flow" (
    set "WITH_CALL_FLOW_FLAG=1"
    shift
    goto parse_args
)
if /i "%~1"=="--extras" (
    set "EXTRAS_FLAG=yes"
    shift
    goto parse_args
)
if /i "%~1"=="--no-extras" (
    set "EXTRAS_FLAG=no"
    shift
    goto parse_args
)
if /i "%~1"=="--model-invocable" (
    if "%~2"=="" (
        echo --model-invocable requires a comma-separated skill list or 'none' >&2
        exit /b 1
    )
    set "MODEL_INVOCABLE_FLAG=%~2"
    shift
    shift
    goto parse_args
)
if /i "%~1"=="--non-interactive" (
    set "NON_INTERACTIVE=1"
    shift
    goto parse_args
)
if /i "%~1"=="--yes" (
    set "NON_INTERACTIVE=1"
    shift
    goto parse_args
)
if /i "%~1"=="--reconfigure" (
    set "RECONFIGURE=1"
    shift
    goto parse_args
)
if /i "%~1"=="--minimal" (
    if "!MINIMAL_FLAG!"=="0" (
        echo --minimal and --no-minimal are mutually exclusive >&2
        exit /b 1
    )
    set "MINIMAL_FLAG=1"
    shift
    goto parse_args
)
if /i "%~1"=="--binary-only" (
    if "!MINIMAL_FLAG!"=="0" (
        echo --binary-only and --no-minimal are mutually exclusive >&2
        exit /b 1
    )
    set "MINIMAL_FLAG=1"
    shift
    goto parse_args
)
if /i "%~1"=="--no-minimal" (
    if "!MINIMAL_FLAG!"=="1" (
        echo --no-minimal and --minimal are mutually exclusive >&2
        exit /b 1
    )
    set "MINIMAL_FLAG=0"
    shift
    goto parse_args
)
if /i "%~1"=="--skip-skills" (
    set "SKIP_SKILLS_FLAG=1"
    shift
    goto parse_args
)
REM Reject any other dash-prefixed token as an unknown option, so a typoed
REM flag like --verify-attesttion fails fast instead of being interpreted as
REM a version tag (which would 404 on releases/download/v--verify-attesttion/...).
REM
REM Uses a variable-assigned substring test instead of `echo %~1 | findstr`
REM because unquoted %~1 in an echo pipe lets cmd.exe interpret shell
REM metacharacters (& | > <) in the argument before the pipe runs. Assigning
REM to a `set "VAR=%~1"` literal-quoted form preserves metacharacters safely,
REM and delayed-expansion substring (!VAR:~0,1!) avoids the subprocess entirely.
REM The error-message echo also quotes "%~1" for the same reason - echoing an
REM unquoted arg containing `&` would re-trigger metacharacter interpretation.
set "CURRENT_ARG=%~1"
if "!CURRENT_ARG:~0,1!"=="-" (
    echo Unknown option: "%~1" >&2
    echo Usage: install.cmd [--version ^<tag^>] [--verify-attestation ^| --skip-attestation] [--with-call-flow] [--extras ^| --no-extras] [--model-invocable ^<list^>] [--minimal ^| --no-minimal] [--skip-skills] [--non-interactive] [--reconfigure] >&2
    exit /b 1
)
REM Positional form: install.cmd vX.Y.Z (legacy interface).
REM Reject if --version was already passed - silent overwrite is worse
REM than a clean usage error.
if "!VERSION_EXPLICIT!"=="1" (
    echo Unexpected positional argument: "%~1" ^(version already set^) >&2
    exit /b 1
)
set "VERSION=%~1"
set "VERSION_EXPLICIT=1"
shift
goto parse_args
:args_done

REM Resolve binary-only mode. Precedence: --minimal / --no-minimal flag >
REM HYPERMARK_MINIMAL env var > default (off). Mirrors install.sh / install.ps1.
set "MINIMAL=0"
if /i "!HYPERMARK_MINIMAL!"=="1"    set "MINIMAL=1"
if /i "!HYPERMARK_MINIMAL!"=="true" set "MINIMAL=1"
if /i "!HYPERMARK_MINIMAL!"=="yes"  set "MINIMAL=1"
if "!MINIMAL_FLAG!"=="1" set "MINIMAL=1"
if "!MINIMAL_FLAG!"=="0" set "MINIMAL=0"

set "REPO=ahmadghoniem/Hypermark"
set "SEM_REPO=Ataraxy-Labs/sem"
set "SEM_VERSION=v0.8.0"
set "INSTALL_DIR=%USERPROFILE%\.local\bin"

REM First hypermark release that carries SLSA build-provenance attestations.
REM See scripts/install.sh for the full explanation - this constant is
REM bumped once at the first attested release via the release skill.
set "MIN_ATTESTED_VERSION=v0.17.2"

REM Attestation-bundle fetch helper, passed to PowerShell via -EncodedCommand
REM so NO script file ever touches %%TEMP%% (a %%RANDOM%%-named .ps1 would be a
REM predictable-path code-execution vector). Inputs travel via env vars
REM (REPO, ATT_DIGEST, ATT_BUNDLE_FILE); exit codes: 0 = bundle written,
REM 2 = fetch failed, 3 = nothing extracted. The blob decodes to EXACTLY the
REM script below (UTF-16LE base64). scripts/install.test.ts decodes the blob,
REM asserts it matches these REM PS: lines byte for byte, and executes its
REM scanner against a captured real attestations response - so the blob
REM cannot silently drift from what is documented here. Regenerate after
REM editing the REM PS: lines:
REM   [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
REM PS: $ErrorActionPreference = 'Stop'
REM PS: try {
REM PS:     $resp = Invoke-WebRequest -Uri ('https://api.github.com/repos/' + $env:REPO + '/attestations/sha256:' + $env:ATT_DIGEST) -UseBasicParsing -TimeoutSec 30
REM PS:     $raw = if ($resp.Content -is [byte[]]) { [System.Text.Encoding]::UTF8.GetString($resp.Content) } else { [string]$resp.Content }
REM PS: } catch { exit 2 }
REM PS: $bundles = @()
REM PS: $searchFrom = 0
REM PS: while ($true) {
REM PS:     $keyIdx = $raw.IndexOf('"bundle"', $searchFrom, [System.StringComparison]::Ordinal)
REM PS:     if ($keyIdx -lt 0) { break }
REM PS:     $searchFrom = $keyIdx + 8
REM PS:     $i = $keyIdx + 8
REM PS:     while ($i -lt $raw.Length -and [char]::IsWhiteSpace($raw[$i])) { $i++ }
REM PS:     if ($i -ge $raw.Length -or $raw[$i] -ne ':') { continue }
REM PS:     $i++
REM PS:     while ($i -lt $raw.Length -and [char]::IsWhiteSpace($raw[$i])) { $i++ }
REM PS:     if ($i -ge $raw.Length -or $raw[$i] -ne '{') { continue }
REM PS:     $depth = 0
REM PS:     $inString = $false
REM PS:     $escaped = $false
REM PS:     $start = $i
REM PS:     for (; $i -lt $raw.Length; $i++) {
REM PS:         $ch = $raw[$i]
REM PS:         if ($escaped) { $escaped = $false; continue }
REM PS:         if ($inString) {
REM PS:             if ($ch -eq '\') { $escaped = $true }
REM PS:             elseif ($ch -eq '"') { $inString = $false }
REM PS:             continue
REM PS:         }
REM PS:         if ($ch -eq '"') { $inString = $true; continue }
REM PS:         if ($ch -eq '{') { $depth++; continue }
REM PS:         if ($ch -eq '}') {
REM PS:             $depth--
REM PS:             if ($depth -eq 0) {
REM PS:                 $bundles += $raw.Substring($start, $i - $start + 1)
REM PS:                 $searchFrom = $i + 1
REM PS:                 break
REM PS:             }
REM PS:         }
REM PS:     }
REM PS: }
REM PS: if ($bundles.Count -eq 0) { exit 3 }
REM PS: try { [System.IO.File]::WriteAllText($env:ATT_BUNDLE_FILE, (($bundles -join [char]10) + [char]10)) } catch { exit 3 }
REM PS: exit 0
set "ATT_FETCH_B64=JABFAHIAcgBvAHIAQQBjAHQAaQBvAG4AUAByAGUAZgBlAHIAZQBuAGMAZQAgAD0AIAAnAFMAdABvAHAAJwAKAHQAcgB5ACAAewAKACAAIAAgACAAJAByAGUAcwBwACAAPQAgAEkAbgB2AG8AawBlAC0AVwBlAGIAUgBlAHEAdQBlAHMAdAAgAC0AVQByAGkAIAAoACcAaAB0AHQAcABzADoALwAvAGEAcABpAC4AZwBpAHQAaAB1AGIALgBjAG8AbQAvAHIAZQBwAG8AcwAvACcAIAArACAAJABlAG4AdgA6AFIARQBQAE8AIAArACAAJwAvAGEAdAB0AGUAcwB0AGEAdABpAG8AbgBzAC8AcwBoAGEAMgA1ADYAOgAnACAAKwAgACQAZQBuAHYAOgBBAFQAVABfAEQASQBHAEUAUwBUACkAIAAtAFUAcwBlAEIAYQBzAGkAYwBQAGEAcgBzAGkAbgBnACAALQBUAGkAbQBlAG8AdQB0AFMAZQBjACAAMwAwAAoAIAAgACAAIAAkAHIAYQB3ACAAPQAgAGkAZgAgACgAJAByAGUAcwBwAC4AQwBvAG4AdABlAG4AdAAgAC0AaQBzACAAWwBiAHkAdABlAFsAXQBdACkAIAB7ACAAWwBTAHkAcwB0AGUAbQAuAFQAZQB4AHQALgBFAG4AYwBvAGQAaQBuAGcAXQA6ADoAVQBUAEYAOAAuAEcAZQB0AFMAdAByAGkAbgBnACgAJAByAGUAcwBwAC4AQwBvAG4AdABlAG4AdAApACAAfQAgAGUAbABzAGUAIAB7ACAAWwBzAHQAcgBpAG4AZwBdACQAcgBlAHMAcAAuAEMAbwBuAHQAZQBuAHQAIAB9AAoAfQAgAGMAYQB0AGMAaAAgAHsAIABlAHgAaQB0ACAAMgAgAH0ACgAkAGIAdQBuAGQAbABlAHMAIAA9ACAAQAAoACkACgAkAHMAZQBhAHIAYwBoAEYAcgBvAG0AIAA9ACAAMAAKAHcAaABpAGwAZQAgACgAJAB0AHIAdQBlACkAIAB7AAoAIAAgACAAIAAkAGsAZQB5AEkAZAB4ACAAPQAgACQAcgBhAHcALgBJAG4AZABlAHgATwBmACgAJwAiAGIAdQBuAGQAbABlACIAJwAsACAAJABzAGUAYQByAGMAaABGAHIAbwBtACwAIABbAFMAeQBzAHQAZQBtAC4AUwB0AHIAaQBuAGcAQwBvAG0AcABhAHIAaQBzAG8AbgBdADoAOgBPAHIAZABpAG4AYQBsACkACgAgACAAIAAgAGkAZgAgACgAJABrAGUAeQBJAGQAeAAgAC0AbAB0ACAAMAApACAAewAgAGIAcgBlAGEAawAgAH0ACgAgACAAIAAgACQAcwBlAGEAcgBjAGgARgByAG8AbQAgAD0AIAAkAGsAZQB5AEkAZAB4ACAAKwAgADgACgAgACAAIAAgACQAaQAgAD0AIAAkAGsAZQB5AEkAZAB4ACAAKwAgADgACgAgACAAIAAgAHcAaABpAGwAZQAgACgAJABpACAALQBsAHQAIAAkAHIAYQB3AC4ATABlAG4AZwB0AGgAIAAtAGEAbgBkACAAWwBjAGgAYQByAF0AOgA6AEkAcwBXAGgAaQB0AGUAUwBwAGEAYwBlACgAJAByAGEAdwBbACQAaQBdACkAKQAgAHsAIAAkAGkAKwArACAAfQAKACAAIAAgACAAaQBmACAAKAAkAGkAIAAtAGcAZQAgACQAcgBhAHcALgBMAGUAbgBnAHQAaAAgAC0AbwByACAAJAByAGEAdwBbACQAaQBdACAALQBuAGUAIAAnADoAJwApACAAewAgAGMAbwBuAHQAaQBuAHUAZQAgAH0ACgAgACAAIAAgACQAaQArACsACgAgACAAIAAgAHcAaABpAGwAZQAgACgAJABpACAALQBsAHQAIAAkAHIAYQB3AC4ATABlAG4AZwB0AGgAIAAtAGEAbgBkACAAWwBjAGgAYQByAF0AOgA6AEkAcwBXAGgAaQB0AGUAUwBwAGEAYwBlACgAJAByAGEAdwBbACQAaQBdACkAKQAgAHsAIAAkAGkAKwArACAAfQAKACAAIAAgACAAaQBmACAAKAAkAGkAIAAtAGcAZQAgACQAcgBhAHcALgBMAGUAbgBnAHQAaAAgAC0AbwByACAAJAByAGEAdwBbACQAaQBdACAALQBuAGUAIAAnAHsAJwApACAAewAgAGMAbwBuAHQAaQBuAHUAZQAgAH0ACgAgACAAIAAgACQAZABlAHAAdABoACAAPQAgADAACgAgACAAIAAgACQAaQBuAFMAdAByAGkAbgBnACAAPQAgACQAZgBhAGwAcwBlAAoAIAAgACAAIAAkAGUAcwBjAGEAcABlAGQAIAA9ACAAJABmAGEAbABzAGUACgAgACAAIAAgACQAcwB0AGEAcgB0ACAAPQAgACQAaQAKACAAIAAgACAAZgBvAHIAIAAoADsAIAAkAGkAIAAtAGwAdAAgACQAcgBhAHcALgBMAGUAbgBnAHQAaAA7ACAAJABpACsAKwApACAAewAKACAAIAAgACAAIAAgACAAIAAkAGMAaAAgAD0AIAAkAHIAYQB3AFsAJABpAF0ACgAgACAAIAAgACAAIAAgACAAaQBmACAAKAAkAGUAcwBjAGEAcABlAGQAKQAgAHsAIAAkAGUAcwBjAGEAcABlAGQAIAA9ACAAJABmAGEAbABzAGUAOwAgAGMAbwBuAHQAaQBuAHUAZQAgAH0ACgAgACAAIAAgACAAIAAgACAAaQBmACAAKAAkAGkAbgBTAHQAcgBpAG4AZwApACAAewAKACAAIAAgACAAIAAgACAAIAAgACAAIAAgAGkAZgAgACgAJABjAGgAIAAtAGUAcQAgACcAXAAnACkAIAB7ACAAJABlAHMAYwBhAHAAZQBkACAAPQAgACQAdAByAHUAZQAgAH0ACgAgACAAIAAgACAAIAAgACAAIAAgACAAIABlAGwAcwBlAGkAZgAgACgAJABjAGgAIAAtAGUAcQAgACcAIgAnACkAIAB7ACAAJABpAG4AUwB0AHIAaQBuAGcAIAA9ACAAJABmAGEAbABzAGUAIAB9AAoAIAAgACAAIAAgACAAIAAgACAAIAAgACAAYwBvAG4AdABpAG4AdQBlAAoAIAAgACAAIAAgACAAIAAgAH0ACgAgACAAIAAgACAAIAAgACAAaQBmACAAKAAkAGMAaAAgAC0AZQBxACAAJwAiACcAKQAgAHsAIAAkAGkAbgBTAHQAcgBpAG4AZwAgAD0AIAAkAHQAcgB1AGUAOwAgAGMAbwBuAHQAaQBuAHUAZQAgAH0ACgAgACAAIAAgACAAIAAgACAAaQBmACAAKAAkAGMAaAAgAC0AZQBxACAAJwB7ACcAKQAgAHsAIAAkAGQAZQBwAHQAaAArACsAOwAgAGMAbwBuAHQAaQBuAHUAZQAgAH0ACgAgACAAIAAgACAAIAAgACAAaQBmACAAKAAkAGMAaAAgAC0AZQBxACAAJwB9ACcAKQAgAHsACgAgACAAIAAgACAAIAAgACAAIAAgACAAIAAkAGQAZQBwAHQAaAAtAC0ACgAgACAAIAAgACAAIAAgACAAIAAgACAAIABpAGYAIAAoACQAZABlAHAAdABoACAALQBlAHEAIAAwACkAIAB7AAoAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAkAGIAdQBuAGQAbABlAHMAIAArAD0AIAAkAHIAYQB3AC4AUwB1AGIAcwB0AHIAaQBuAGcAKAAkAHMAdABhAHIAdAAsACAAJABpACAALQAgACQAcwB0AGEAcgB0ACAAKwAgADEAKQAKACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAJABzAGUAYQByAGMAaABGAHIAbwBtACAAPQAgACQAaQAgACsAIAAxAAoAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIABiAHIAZQBhAGsACgAgACAAIAAgACAAIAAgACAAIAAgACAAIAB9AAoAIAAgACAAIAAgACAAIAAgAH0ACgAgACAAIAAgAH0ACgB9AAoAaQBmACAAKAAkAGIAdQBuAGQAbABlAHMALgBDAG8AdQBuAHQAIAAtAGUAcQAgADAAKQAgAHsAIABlAHgAaQB0ACAAMwAgAH0ACgB0AHIAeQAgAHsAIABbAFMAeQBzAHQAZQBtAC4ASQBPAC4ARgBpAGwAZQBdADoAOgBXAHIAaQB0AGUAQQBsAGwAVABlAHgAdAAoACQAZQBuAHYAOgBBAFQAVABfAEIAVQBOAEQATABFAF8ARgBJAEwARQAsACAAKAAoACQAYgB1AG4AZABsAGUAcwAgAC0AagBvAGkAbgAgAFsAYwBoAGEAcgBdADEAMAApACAAKwAgAFsAYwBoAGEAcgBdADEAMAApACkAIAB9ACAAYwBhAHQAYwBoACAAewAgAGUAeABpAHQAIAAzACAAfQAKAGUAeABpAHQAIAAwAAoA"

REM Detect architecture. Native ARM64 Windows binaries are built from
REM bun-windows-arm64 (stable since Bun v1.3.10), so ARM64 hosts get a
REM native binary - no Windows x86-64 emulation tax. PROCESSOR_ARCHITECTURE
REM reports the architecture the current cmd.exe process is running under;
REM PROCESSOR_ARCHITEW6432 is set only in 32-bit processes running via
REM WoW64 and reflects the host architecture (covers the edge case of a
REM 32-bit tool launching install.cmd on an ARM64 machine).
set "PLATFORM="
if /i "%PROCESSOR_ARCHITECTURE%"=="AMD64"    set "PLATFORM=win32-x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64"    set "PLATFORM=win32-arm64"
if /i "%PROCESSOR_ARCHITEW6432%"=="AMD64"    set "PLATFORM=win32-x64"
if /i "%PROCESSOR_ARCHITEW6432%"=="ARM64"    set "PLATFORM=win32-arm64"

if "!PLATFORM!"=="" (
    echo Hypermark does not support 32-bit Windows. >&2
    exit /b 1
)

REM Check for curl availability
curl --version >nul 2>&1
if !ERRORLEVEL! neq 0 (
    echo curl is required but not available. Please use the PowerShell installer. >&2
    exit /b 1
)

REM Create install directory
if not exist "!INSTALL_DIR!" mkdir "!INSTALL_DIR!"

REM Get version to install
if /i "!VERSION!"=="latest" (
    echo Fetching latest version...

    REM api.github.com caps unauthenticated requests at 60/hour per source IP,
    REM which fails installs behind shared egress IPs (NAT/CGNAT/corporate
    REM proxies) and during repeated/debug runs within an hour. Attach an
    REM Authorization header when a token is available (raises the limit to
    REM 5000/hour); when none is found, fall back to anonymous (unchanged
    REM behavior). Precedence matches `gh`: GITHUB_TOKEN > GH_TOKEN > gh auth token.
    REM Read the env vars via delayed expansion, never percent expansion, so
    REM the value is not re-parsed by cmd's phase-1 expansion - a value
    REM containing metacharacters or exclamation marks can neither inject
    REM commands nor be corrupted here.
    set "GH_TOKEN_VAL="
    if defined GITHUB_TOKEN set "GH_TOKEN_VAL=!GITHUB_TOKEN!"
    if not defined GH_TOKEN_VAL if defined GH_TOKEN set "GH_TOKEN_VAL=!GH_TOKEN!"
    if not defined GH_TOKEN_VAL (
        REM Resolve gh via `where` and invoke the absolute path so the for /f
        REM command line never runs a bare `gh` name, which cmd would resolve
        REM from the current directory first. (`where` itself also searches
        REM the CWD first - accepted limitation, documented here.)
        REM --hostname github.com scopes the fallback to github.com
        REM credentials, so a gh setup whose default host is a GitHub
        REM Enterprise server never leaks a GHES token to api.github.com. On
        REM an ancient gh without the flag, stderr is swallowed and we fall
        REM back to anonymous.
        set "GH_EXE="
        for /f "delims=" %%g in ('where gh 2^>nul') do if not defined GH_EXE set "GH_EXE=%%g"
        if defined GH_EXE (
            for /f "delims=" %%i in ('"!GH_EXE!" auth token --hostname github.com 2^>nul') do set "GH_TOKEN_VAL=%%i"
        )
        set "GH_EXE="
    )
    REM Charset allowlist: GitHub tokens are [A-Za-z0-9_] (plus - to be
    REM safe). Strip every allowed character (cmd substitution is
    REM case-insensitive, covering A-Z too); anything left over means an
    REM unexpected character - a quote in particular could break out of the
    REM quoted Authorization header on the curl line below - so drop the
    REM token and go anonymous. Done with pure delayed-expansion
    REM substitutions: a findstr pipe cannot be used because delayed
    REM expansion does not survive into pipe children, and writing the token
    REM to a temp file for findstr would leak the secret to disk.
    if defined GH_TOKEN_VAL (
        set "TOKEN_RESIDUE=!GH_TOKEN_VAL!"
        for %%c in (a b c d e f g h i j k l m n o p q r s t u v w x y z 0 1 2 3 4 5 6 7 8 9 _ -) do if defined TOKEN_RESIDUE set "TOKEN_RESIDUE=!TOKEN_RESIDUE:%%c=!"
        if defined TOKEN_RESIDUE set "GH_TOKEN_VAL="
        set "TOKEN_RESIDUE="
    )
    if defined GH_TOKEN_VAL (
        set "GH_AUTH_HEADER=-H "Authorization: Bearer !GH_TOKEN_VAL!""
    ) else (
        set "GH_AUTH_HEADER="
    )

    REM Download release info to a randomized temp file so concurrent
    REM invocations don't collide and a same-user pre-placed symlink at
    REM a predictable path can't redirect curl's output.
    set "RELEASE_JSON=%TEMP%\hypermark-release-%RANDOM%.json"
    curl -fsSL !GH_AUTH_HEADER! "https://api.github.com/repos/!REPO!/releases/latest" -o "!RELEASE_JSON!"
    REM A stale/revoked token (expired GITHUB_TOKEN lingering in CI images,
    REM dotfiles, direnv) gets a 401 here and would break an install that
    REM works fine anonymously today. If the authenticated call failed and
    REM we had a token, retry once without the header so a bad token costs
    REM one extra request but never blocks an otherwise-working install.
    REM Note: install.sh / install.ps1 inspect the HTTP status and retry
    REM only on 401; capturing the status portably in batch is not worth the
    REM complexity, so cmd retries on any failure when a token was used - an
    REM accepted cmd-only compromise. See ahmadghoniem/Hypermark#1157.
    REM Both ERRORLEVEL reads below sit immediately adjacent to the curl
    REM they test (only REM lines and a no-op if in between); the token
    REM clears deliberately come AFTER the failure check because `set` can
    REM disturb ERRORLEVEL.
    if !ERRORLEVEL! neq 0 if defined GH_AUTH_HEADER (
        curl -fsSL "https://api.github.com/repos/!REPO!/releases/latest" -o "!RELEASE_JSON!"
    )
    if !ERRORLEVEL! neq 0 (
        echo Failed to get latest version >&2
        exit /b 1
    )
    REM Drop the local token copies; downloads and git clone are anonymous.
    REM GITHUB_TOKEN / GH_TOKEN themselves remain in the environment exactly
    REM as the user set them.
    set "GH_TOKEN_VAL="
    set "GH_AUTH_HEADER="

    REM Extract tag_name from JSON
    for /f "tokens=2 delims=:," %%i in ('findstr /c:"\"tag_name\"" "!RELEASE_JSON!"') do (
        set "TAG=%%i"
        set "TAG=!TAG: =!"
        set "TAG=!TAG:"=!"
    )
    del "!RELEASE_JSON!"

    if "!TAG!"=="" (
        echo Failed to parse version >&2
        exit /b 1
    )
) else (
    set "TAG=!VERSION!"
    REM Add v prefix if not present. Use a substring test rather than
    REM piping the expanded variable through findstr - an unquoted echo
    REM pipe re-exposes cmd metacharacters (& | > <) in the value before
    REM the pipe runs. Matches the safe pattern used in the arg parser.
    if not "!TAG:~0,1!"=="v" set "TAG=v!TAG!"
)

echo Installing hypermark !TAG!...

REM Resolve SLSA build-provenance verification opt-in BEFORE the download so
REM we can fail fast without wasting bandwidth if the requested tag predates
REM provenance support. Precedence: CLI flag > env var > config.json > default.
set "VERIFY_ATTESTATION=0"

REM Layer 3: config file (lowest precedence of the opt-in sources).
REM Unset HYPERMARK_DATA_DIR: an existing %USERPROFILE%\.hypermark always
REM wins, so an install never relocates itself; otherwise an explicitly-set
REM absolute XDG_DATA_HOME (rare on Windows but honored the same way as the
REM runtime; drive-rooted or UNC) places the directory at
REM XDG_DATA_HOME\hypermark; otherwise %USERPROFILE%\.hypermark.
REM A fresh root (spec 06, decision D5): Hypermark starts at ~/.hypermark and
REM never probes ~/.plannotator, so an existing Plannotator install keeps its
REM plans, drafts and config exactly where they are.
if defined HYPERMARK_DATA_DIR (
    set "_CONFIG_DIR=!HYPERMARK_DATA_DIR!"
) else (
    set "_CONFIG_DIR=%USERPROFILE%\.hypermark"
    if not exist "%USERPROFILE%\.hypermark\" if defined XDG_DATA_HOME (
        if "!XDG_DATA_HOME:~1,1!"==":" (
            set "_CONFIG_DIR=!XDG_DATA_HOME!\hypermark"
        ) else if "!XDG_DATA_HOME:~0,2!"=="\\" (
            set "_CONFIG_DIR=!XDG_DATA_HOME!\hypermark"
        )
    )
)
if /i "!_CONFIG_DIR!"=="~" set "_CONFIG_DIR=%USERPROFILE%"
if "!_CONFIG_DIR:~0,2!"=="~\" set "_CONFIG_DIR=%USERPROFILE%\!_CONFIG_DIR:~2!"
if "!_CONFIG_DIR:~0,2!"=="~/" set "_CONFIG_DIR=%USERPROFILE%\!_CONFIG_DIR:~2!"
if exist "!_CONFIG_DIR!\config.json" (
    findstr /r /c:"\"verifyAttestation\"[ 	]*:[ 	]*true" "!_CONFIG_DIR!\config.json" >nul 2>&1
    if !ERRORLEVEL! equ 0 set "VERIFY_ATTESTATION=1"
)

REM Layer 2: env var (overrides config file).
if /i "!HYPERMARK_VERIFY_ATTESTATION!"=="1"    set "VERIFY_ATTESTATION=1"
if /i "!HYPERMARK_VERIFY_ATTESTATION!"=="true" set "VERIFY_ATTESTATION=1"
if /i "!HYPERMARK_VERIFY_ATTESTATION!"=="yes"  set "VERIFY_ATTESTATION=1"
if /i "!HYPERMARK_VERIFY_ATTESTATION!"=="0"    set "VERIFY_ATTESTATION=0"
if /i "!HYPERMARK_VERIFY_ATTESTATION!"=="false" set "VERIFY_ATTESTATION=0"
if /i "!HYPERMARK_VERIFY_ATTESTATION!"=="no"   set "VERIFY_ATTESTATION=0"

REM Layer 1: CLI flag (overrides everything).
if "!VERIFY_ATTESTATION_FLAG!"=="1" set "VERIFY_ATTESTATION=1"
if "!VERIFY_ATTESTATION_FLAG!"=="0" set "VERIFY_ATTESTATION=0"

REM Resolve the CallDiff call-flow runtime opt-in. Same three-layer shape as
REM verifyAttestation: CLI flag > env var > config.json > default (off).
set "INSTALL_CALL_FLOW=0"
if exist "!_CONFIG_DIR!\config.json" (
    findstr /r /c:"\"installCallFlow\"[ 	]*:[ 	]*true" "!_CONFIG_DIR!\config.json" >nul 2>&1
    if !ERRORLEVEL! equ 0 set "INSTALL_CALL_FLOW=1"
)
if /i "!HYPERMARK_INSTALL_CALLDIFF!"=="1"     set "INSTALL_CALL_FLOW=1"
if /i "!HYPERMARK_INSTALL_CALLDIFF!"=="true"  set "INSTALL_CALL_FLOW=1"
if /i "!HYPERMARK_INSTALL_CALLDIFF!"=="yes"   set "INSTALL_CALL_FLOW=1"
if /i "!HYPERMARK_INSTALL_CALLDIFF!"=="0"     set "INSTALL_CALL_FLOW=0"
if /i "!HYPERMARK_INSTALL_CALLDIFF!"=="false" set "INSTALL_CALL_FLOW=0"
if /i "!HYPERMARK_INSTALL_CALLDIFF!"=="no"    set "INSTALL_CALL_FLOW=0"
if "!WITH_CALL_FLOW_FLAG!"=="1" set "INSTALL_CALL_FLOW=1"

REM skipInstall.skills is not an agent - it opts out of the skills/slash-command
REM checkout for every scope at once - but it shares the same three layers.
set "SKIP_SKILLS=0"
set "SKIP_SKILLS_SOURCE="
if exist "!_CONFIG_DIR!\config.json" (
    set "PLN_CONFIG_JSON=!_CONFIG_DIR!\config.json"
    for /f "usebackq delims=" %%K in (`powershell -NoProfile -Command "try { $c = Get-Content $env:PLN_CONFIG_JSON -Raw | ConvertFrom-Json } catch { exit 0 }; if (-not $c.skipInstall) { exit 0 }; foreach ($k in @('skills')) { $v = $c.skipInstall.$k; if ($v -is [bool] -and $v) { $k } }"`) do (
        if /i "%%K"=="skills" (
            set "SKIP_SKILLS=1"
            set "SKIP_SKILLS_SOURCE=config skipInstall.skills"
        )
    )
    set "PLN_CONFIG_JSON="
)
for %%V in (1 true yes) do if /i "!HYPERMARK_SKIP_SKILLS_INSTALL!"=="%%V" (
    set "SKIP_SKILLS=1"
    set "SKIP_SKILLS_SOURCE=HYPERMARK_SKIP_SKILLS_INSTALL"
)
for %%V in (0 false no) do if /i "!HYPERMARK_SKIP_SKILLS_INSTALL!"=="%%V" (
    set "SKIP_SKILLS=0"
    set "SKIP_SKILLS_SOURCE="
)
if "!SKIP_SKILLS_FLAG!"=="1" (
    set "SKIP_SKILLS=1"
    set "SKIP_SKILLS_SOURCE=--skip-skills"
)

REM Pre-flight: reject verification requests for tags older than the first
REM attested release BEFORE downloading. Critical security point: the version
REM comparison uses $env:TAG_NUM / $env:MIN_NUM instead of interpolating
REM !TAG_NUM! / !MIN_NUM! into the PowerShell command string. Interpolation
REM would let a crafted --version value break out of the single-quoted literal
REM and execute arbitrary PowerShell (e.g. --version "0.18.0'; calc; '0.18.0"
REM would run Calculator). $env: reads the raw string; PowerShell never parses
REM the value as code. [version] cast throws on invalid input, catch swallows,
REM VERSION_OK stays empty, and the guard rejects - safe fail.
if "!VERIFY_ATTESTATION!"=="1" (
    REM Strip the leading `v` via substring-from-index-1. cmd's `:str=repl`
    REM substitution is GLOBAL, not anchored - `!TAG:v=!` would remove every
    REM `v` in the string, not just the leading one, so a hypothetical tag
    REM like `v1.0.0-rev2` would become `1.0.0-re2` and break the [version]
    REM cast. TAG is guaranteed to start with `v` by the normalization step
    REM above, so `:~1` (drop first char) is equivalent to stripping the
    REM leading prefix.
    set "TAG_NUM=!TAG:~1!"
    set "MIN_NUM=!MIN_ATTESTED_VERSION:~1!"

    REM Detect pre-release / build-metadata tags (e.g. v0.18.0-rc1) BEFORE
    REM handing the value to PowerShell. [System.Version] doesn't support
    REM semver prerelease suffixes and would throw inside the try/catch,
    REM leaving VERSION_OK empty and surfacing a misleading "predates
    REM attestation support" error. install.sh handles these correctly via
    REM `sort -V`; Windows doesn't have a built-in semver comparator, so
    REM we reject explicitly with an accurate diagnosis instead of silently
    REM misclassifying the failure.
    REM
    REM Uses native cmd substitution `!VAR:-=!` to check for `-` presence -
    REM no subshell, no metacharacter risk. If removing `-` changes the
    REM string, the original contained a `-`.
    if not "!TAG_NUM!"=="!TAG_NUM:-=!" (
        echo Pre-release tags like !TAG! aren't currently supported for >&2
        echo provenance verification on Windows. [System.Version] doesn't >&2
        echo parse semver prerelease suffixes. Options: >&2
        echo   - Install without provenance verification: --skip-attestation >&2
        echo   - Pin to a stable release tag ^(no `-rc`, `-beta`, etc.^) >&2
        exit /b 1
    )

    set "VERSION_OK="
    for /f "delims=" %%i in ('powershell -NoProfile -Command "try { if ([version]$env:TAG_NUM -ge [version]$env:MIN_NUM) { 'yes' } } catch {}"') do set "VERSION_OK=%%i"
    if not "!VERSION_OK!"=="yes" (
        echo Provenance verification was requested, but !TAG! predates >&2
        echo hypermark's attestation support. The first release carrying >&2
        echo signed build provenance is !MIN_ATTESTED_VERSION!. Options: >&2
        echo   - Pin to !MIN_ATTESTED_VERSION! or later: --version !MIN_ATTESTED_VERSION! >&2
        echo   - Install without provenance verification: --skip-attestation >&2
        echo   - Or unset HYPERMARK_VERIFY_ATTESTATION / remove verifyAttestation >&2
        echo     from %USERPROFILE%\.hypermark\config.json >&2
        exit /b 1
    )
)

set "BINARY_NAME=hypermark-!PLATFORM!.exe"
set "BINARY_URL=https://github.com/!REPO!/releases/download/!TAG!/!BINARY_NAME!"
set "CHECKSUM_URL=!BINARY_URL!.sha256"

REM Download binary to a randomized temp path so concurrent invocations
REM don't collide and a same-user pre-placed symlink at a predictable
REM path can't redirect where curl writes the downloaded executable.
REM The SHA256 check would pass regardless (content is authentic), but
REM the install destination would be corrupted.
set "TEMP_FILE=%TEMP%\hypermark-%RANDOM%.exe"
curl -fsSL "!BINARY_URL!" -o "!TEMP_FILE!"
if !ERRORLEVEL! neq 0 (
    echo Failed to download binary >&2
    if exist "!TEMP_FILE!" del "!TEMP_FILE!"
    exit /b 1
)

REM Download checksum to a randomized temp path for the same reason as
REM the binary download above (concurrent collision + symlink pre-placement).
set "CHECKSUM_FILE=%TEMP%\hypermark-checksum-%RANDOM%.txt"
curl -fsSL "!CHECKSUM_URL!" -o "!CHECKSUM_FILE!"
if !ERRORLEVEL! neq 0 (
    echo Failed to download checksum >&2
    REM curl -o creates the output file before receiving data, so a
    REM network failure or HTTP error leaves a 0-byte/partial file
    REM at CHECKSUM_FILE. Clean it up to match the discipline used
    REM for TEMP_FILE elsewhere in this script.
    if exist "!CHECKSUM_FILE!" del "!CHECKSUM_FILE!"
    del "!TEMP_FILE!"
    exit /b 1
)

REM Extract expected checksum (first field)
set /p EXPECTED_CHECKSUM=<"!CHECKSUM_FILE!"
for /f "tokens=1" %%i in ("!EXPECTED_CHECKSUM!") do set "EXPECTED_CHECKSUM=%%i"
del "!CHECKSUM_FILE!"

REM Verify checksum using certutil
set "ACTUAL_CHECKSUM="
for /f "skip=1 tokens=*" %%i in ('certutil -hashfile "!TEMP_FILE!" SHA256') do (
    if not defined ACTUAL_CHECKSUM (
        set "ACTUAL_CHECKSUM=%%i"
        set "ACTUAL_CHECKSUM=!ACTUAL_CHECKSUM: =!"
    )
)

if /i "!ACTUAL_CHECKSUM!" neq "!EXPECTED_CHECKSUM!" (
    echo Checksum verification failed >&2
    del "!TEMP_FILE!"
    exit /b 1
)

if "!VERIFY_ATTESTATION!"=="1" (
    REM VERIFY_ATTESTATION was resolved before the download; MIN_ATTESTED_VERSION
    REM pre-flight already ran and rejected older tags. At this point we know
    REM the tag is attested and gh should find a bundle.
    where gh >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        REM Capture combined output to a randomized temp file so gh's
        REM actual error message (auth, network, missing attestation, etc.)
        REM can be surfaced on failure. Randomized to match the existing
        REM %RANDOM% pattern used elsewhere in this script and avoid races
        REM between concurrent invocations. Matches install.sh / install.ps1.
        REM
        REM Verification is constrained to the exact tag (--source-ref) AND
        REM the specific signing workflow file (--signer-workflow) - not
        REM just "built somewhere in this repo". See install.sh for full
        REM rationale.
        REM Credential-free path first (#1178): the attestations endpoint on
        REM api.github.com is world-readable for public repos, so fetch the
        REM Sigstore bundle anonymously and hand it to gh via --bundle. This
        REM drops the gh-login requirement; gh's own authenticated fetch is
        REM only used as a fallback when the public fetch fails. Single fetch
        REM attempt, deliberately never retried: the unauthenticated API
        REM allows 60 requests/hour per IP. The response is
        REM { "attestations": [ { "bundle": {...} } ] }; gh --bundle expects
        REM the bundle values one JSON document per line (the JSONL format
        REM `gh attestation download` writes). PowerShell does the fetch and
        REM the extraction via the ATT_FETCH_B64 -EncodedCommand payload
        REM (documented and drift-guarded where it is defined, near the top
        REM of this file): each bundle is copied as a byte-exact substring of
        REM the response, never a ConvertFrom-Json round trip whose DateTime
        REM coercion could corrupt a bundle field. Values pass via $env: so
        REM nothing is re-parsed as code, and no helper file ever exists on
        REM disk. Exit codes: 0 = bundle written, 2 = fetch failed, 3 = no
        REM bundle extracted.
        set "ATT_BUNDLE_FILE=%TEMP%\hypermark-bundle-%RANDOM%.jsonl"
        set "ATT_DIGEST=!ACTUAL_CHECKSUM!"
        set "ATT_BUNDLE_OK=0"
        REM NOTE: the ATT_FALLBACK_REASON literals below are assigned inside
        REM parenthesized blocks - they must stay free of unescaped cmd
        REM metacharacters, parentheses above all, or the block parse breaks.
        set "ATT_FALLBACK_REASON=Could not fetch the attestation bundle from the public API"
        powershell -NoProfile -EncodedCommand !ATT_FETCH_B64!
        if !ERRORLEVEL! equ 0 (
            if exist "!ATT_BUNDLE_FILE!" set "ATT_BUNDLE_OK=1"
        ) else if !ERRORLEVEL! equ 3 (
            set "ATT_FALLBACK_REASON=Could not extract a bundle from the attestations API response"
        )
        set "GH_OUTPUT=%TEMP%\hypermark-gh-%RANDOM%.txt"
        set "ATT_USED_BUNDLE=0"
        if "!ATT_BUNDLE_OK!"=="1" (
            set "ATT_USED_BUNDLE=1"
            gh attestation verify "!TEMP_FILE!" ^
                --bundle "!ATT_BUNDLE_FILE!" ^
                --repo "!REPO!" ^
                --source-ref "refs/tags/!TAG!" ^
                --signer-workflow "ahmadghoniem/Hypermark/.github/workflows/release.yml" ^
                > "!GH_OUTPUT!" 2>&1
            if !ERRORLEVEL! neq 0 (
                REM H1: a --bundle failure is not necessarily a provenance
                REM failure - an older gh rejects the flag outright, a corrupt
                REM bundle fails parsing, etc. Retry once through the exact
                REM authenticated path before classifying anything; only the
                REM retry's verdict is reported. A real provenance failure
                REM fails again here, so nothing bad ever slips through.
                echo Bundle-based verification did not complete; retrying via gh's authenticated fetch.
                set "ATT_USED_BUNDLE=0"
                gh attestation verify "!TEMP_FILE!" ^
                    --repo "!REPO!" ^
                    --source-ref "refs/tags/!TAG!" ^
                    --signer-workflow "ahmadghoniem/Hypermark/.github/workflows/release.yml" ^
                    > "!GH_OUTPUT!" 2>&1
            )
        ) else (
            echo !ATT_FALLBACK_REASON!; falling back to gh's authenticated fetch.
            gh attestation verify "!TEMP_FILE!" ^
                --repo "!REPO!" ^
                --source-ref "refs/tags/!TAG!" ^
                --signer-workflow "ahmadghoniem/Hypermark/.github/workflows/release.yml" ^
                > "!GH_OUTPUT!" 2>&1
        )
        if !ERRORLEVEL! neq 0 (
            type "!GH_OUTPUT!" >&2
            REM Classify the failure so connectivity problems are never
            REM conflated with a provenance failure. "Sigstore verifiers"
            REM means gh could not initialize the TUF trust root, which is
            REM fetched on EVERY run (never cached); "gh auth login" is only
            REM reachable on the authenticated path. Precedence: TUF wins
            REM over auth (the auth findstr runs first so the TUF assignment
            REM lands last, matching install.sh / install.ps1).
            set "VERIFY_FAIL_KIND=provenance"
            findstr /c:"gh auth login" "!GH_OUTPUT!" >nul 2>&1
            if !ERRORLEVEL! equ 0 set "VERIFY_FAIL_KIND=auth"
            findstr /c:"Sigstore verifiers" "!GH_OUTPUT!" >nul 2>&1
            if !ERRORLEVEL! equ 0 set "VERIFY_FAIL_KIND=tuf"
            del "!GH_OUTPUT!"
            if exist "!ATT_BUNDLE_FILE!" del "!ATT_BUNDLE_FILE!"
            if "!VERIFY_FAIL_KIND!"=="tuf" (
                echo Could not initialize the Sigstore trust root ^(TUF^). Provenance >&2
                echo verification needs network access on every run; the trusted root >&2
                echo is fetched per-run, never cached. This is a connectivity failure, >&2
                echo NOT evidence of a bad binary. Refusing to install unverified; >&2
                echo retry with network access or pass --skip-attestation. >&2
            )
            if "!VERIFY_FAIL_KIND!"=="auth" (
                echo The credential-free bundle path did not complete and gh is not >&2
                echo logged in, so the authenticated fallback could not run. Retry with >&2
                echo network access to api.github.com, run 'gh auth login', or pass >&2
                echo --skip-attestation. >&2
            )
            if "!VERIFY_FAIL_KIND!"=="provenance" (
                echo Attestation verification failed! >&2
                echo The binary's SHA256 matched, but no valid signed provenance was found >&2
                echo for !REPO!. Refusing to install. >&2
            )
            del "!TEMP_FILE!"
            exit /b 1
        )
        del "!GH_OUTPUT!"
        if "!ATT_USED_BUNDLE!"=="1" (
            echo [OK] verified build provenance ^(SLSA, credential-free via the public attestations API^)
        ) else (
            echo [OK] verified build provenance ^(SLSA^)
        )
        if exist "!ATT_BUNDLE_FILE!" del "!ATT_BUNDLE_FILE!"
    ) else (
        echo verifyAttestation is enabled but gh CLI was not found. >&2
        echo Install https://cli.github.com ^(no login is needed when the public >&2
        echo attestation bundle fetch succeeds^), or unset >&2
        echo HYPERMARK_VERIFY_ATTESTATION / remove verifyAttestation >&2
        echo from %USERPROFILE%\.hypermark\config.json / pass --skip-attestation. >&2
        del "!TEMP_FILE!"
        exit /b 1
    )
) else (
    echo SHA256 verified. For build provenance verification, see
    echo https://github.com/ahmadghoniem/Hypermark/releases
)

REM Install binary
set "INSTALL_PATH=!INSTALL_DIR!\hypermark.exe"
move /y "!TEMP_FILE!" "!INSTALL_PATH!" >nul

echo.
echo hypermark !TAG! installed to !INSTALL_PATH!

REM Binary-only mode stops here (see the MINIMAL resolution after :args_done):
REM the binary is installed, so print PATH advice and exit before any sidecar
REM download, agent integration, skill checkout, or config write runs. No
REM persistent state is written outside !INSTALL_DIR!.
if "!MINIMAL!"=="1" (
    call :PrintPathAdvice
    echo.
    echo Minimal install complete - only the hypermark binary was installed.
    echo No skills, hooks, agent integrations, or config files were written.
    exit /b 0
)

call :InstallSemSidecar
call :InstallAgentTerminalRuntime
call :InstallCallFlowRuntime

call :PrintPathAdvice

REM Validate plugin hooks.json if plugin is already installed
if defined CLAUDE_CONFIG_DIR (
    set "PLUGIN_HOOKS=%CLAUDE_CONFIG_DIR%\plugins\marketplaces\hypermark\apps\hook\hooks\hooks.json"
) else (
    set "PLUGIN_HOOKS=%USERPROFILE%\.claude\plugins\marketplaces\hypermark\apps\hook\hooks\hooks.json"
)
if exist "!PLUGIN_HOOKS!" (
    REM Use full path so the hook works without PATH being set in the shell
    set "EXE_PATH=!INSTALL_PATH:\=/!"
    (
echo {
echo   "hooks": {
echo     "PreToolUse": [
echo       {
echo         "matcher": "EnterPlanMode",
echo         "hooks": [
echo           {
echo             "type": "command",
echo             "command": "\"!EXE_PATH!\" improve-context",
echo             "timeout": 5
echo           }
echo         ]
echo       }
echo     ],
echo     "PermissionRequest": [
echo       {
echo         "matcher": "ExitPlanMode",
echo         "hooks": [
echo           {
echo             "type": "command",
echo             "command": "\"!EXE_PATH!\"",
echo             "timeout": 345600
echo           }
echo         ]
echo       }
echo     ]
echo   }
echo }
    ) > "!PLUGIN_HOOKS!"
    echo Updated plugin hooks at !PLUGIN_HOOKS!
)


REM ----------------------------------------------------------------------
REM Skills + command stubs install (requires git)
REM
REM Claude Code commands are deprecated in favor of skills. Core skills
REM installed to %%USERPROFILE%%\.claude\skills are user-invocable by directory
REM name (/hypermark-review etc.), so no command files are written anymore.
REM
REM Install matrix (all copies verbatim, copy-if-present so older-tag pinned
REM installs never fail when a source dir is absent):
REM   %%USERPROFILE%%\.claude\skills            <- apps\skills\claude\* (3) + apps\skills\core\hypermark
REM   %%USERPROFILE%%\.agents\skills            <- apps\skills\core\* (all 4)
REM ----------------------------------------------------------------------

REM Aggressive cleanup on upgrade - echo each removal, ignore missing.
REM NOTE: legacy Claude command cleanup happens AFTER the skill install below -
REM a command file is only removed once its replacement skill is on disk, so a
REM failed or skipped skill install never leaves users with neither.
if defined CLAUDE_CONFIG_DIR (
    set "CLAUDE_COMMANDS_DIR=%CLAUDE_CONFIG_DIR%\commands"
) else (
    set "CLAUDE_COMMANDS_DIR=%USERPROFILE%\.claude\commands"
)

REM Old installers (pre core/extra split) ran a wholesale skills copy against
REM a new-layout tag and could leave junk core/extra directory copies in the
REM Claude skills scope. Never valid skill names - always safe to remove.
if defined CLAUDE_CONFIG_DIR (
    set "CLAUDE_SKILLS_SCOPE=%CLAUDE_CONFIG_DIR%\skills"
) else (
    set "CLAUDE_SKILLS_SCOPE=%USERPROFILE%\.claude\skills"
)
for %%J in (core extra) do (
    if exist "!CLAUDE_SKILLS_SCOPE!\%%J" (
        rmdir /s /q "!CLAUDE_SKILLS_SCOPE!\%%J" >nul 2>&1
        echo Removed stale layout directory !CLAUDE_SKILLS_SCOPE!\%%J ^(left by an older installer^)
    )
)

REM Extras are no longer managed in the Claude / shared-agent scopes. Remove
REM previously default-installed copies ONCE per machine - recorded in the
REM migrations ledger under the Hypermark data dir - because copies the user
REM reinstalls via `npx skills add` are byte-identical to ours and can only be
REM told apart by remembering that this cleanup already ran.
if defined CLAUDE_CONFIG_DIR (
    set "CLAUDE_SKILLS_DIR=%CLAUDE_CONFIG_DIR%\skills"
) else (
    set "CLAUDE_SKILLS_DIR=%USERPROFILE%\.claude\skills"
)
set "AGENTS_SKILLS_DIR=%USERPROFILE%\.agents\skills"
set "MIGRATIONS_DIR=!_CONFIG_DIR!\migrations"
set "EXTRAS_MIGRATION=!MIGRATIONS_DIR!\2026-06-extras-default-install-removed"
if not exist "!EXTRAS_MIGRATION!" (
    for %%S in (hypermark-compound hypermark-setup-goal hypermark-visual-explainer) do (
        if exist "!CLAUDE_SKILLS_DIR!\%%S" (
            rmdir /s /q "!CLAUDE_SKILLS_DIR!\%%S" >nul 2>&1
            echo Removed extra Hypermark skill from !CLAUDE_SKILLS_DIR!\%%S ^(reinstall via npx skills add^)
        )
        if exist "!AGENTS_SKILLS_DIR!\%%S" (
            rmdir /s /q "!AGENTS_SKILLS_DIR!\%%S" >nul 2>&1
            echo Removed extra Hypermark skill from !AGENTS_SKILLS_DIR!\%%S ^(reinstall via npx skills add^)
        )
    )
    if not exist "!MIGRATIONS_DIR!" mkdir "!MIGRATIONS_DIR!" >nul 2>&1
    type nul > "!EXTRAS_MIGRATION!"
)

REM --- Guided install (interactive consoles only) ---
REM Mirrors install.sh: two questions (extras? model-invocable skills?),
REM answers persisted to install-prefs in the Hypermark data dir and reused
REM silently on re-runs. --reconfigure re-opens the wizard; --non-interactive
REM forces silence. `set /p` returns empty at EOF, so redirected/CI runs fall
REM through to the defaults without hanging. Flags win over everything.
REM No checkbox UI in batch - the skill picker uses numbered toggles instead.
set "PREFS_FILE=!_CONFIG_DIR!\install-prefs"
set "SAVED_EXTRAS="
set "SAVED_INVOCABLE="
if exist "!PREFS_FILE!" (
    for /f "usebackq tokens=1,* delims==" %%A in ("!PREFS_FILE!") do (
        if /i "%%A"=="extras" set "SAVED_EXTRAS=%%B"
        if /i "%%A"=="model_invocable" set "SAVED_INVOCABLE=%%B"
    )
)

REM Extras already on disk? Then the extras question is moot - they still
REM count toward the picker list, and we never launch the npx flow over them.
set "EXTRAS_PRESENT=0"
for %%S in (hypermark-compound hypermark-setup-goal hypermark-visual-explainer) do (
    if exist "!CLAUDE_SKILLS_DIR!\%%S" set "EXTRAS_PRESENT=1"
    if exist "!AGENTS_SKILLS_DIR!\%%S" set "EXTRAS_PRESENT=1"
)

REM A wizard needs a real console. `timeout` exits non-zero when stdin is
REM redirected ("Input redirection is not supported"), making it a reliable
REM console probe - CI and redirected runs never see the wizard and never
REM trigger the wizard-only installs (npx extras). The set /p
REM EOF-fallthrough remains as a second line of defense.
set "CAN_PROMPT=0"
timeout /t 0 >nul 2>&1
if !ERRORLEVEL! equ 0 set "CAN_PROMPT=1"
if "!NON_INTERACTIVE!"=="1" set "CAN_PROMPT=0"
set "RUN_WIZARD=0"
if "!CAN_PROMPT!"=="1" (
    if "!RECONFIGURE!"=="1" set "RUN_WIZARD=1"
    if not exist "!PREFS_FILE!" set "RUN_WIZARD=1"
)

set "EXTRAS_CHOICE="
set "INVOCABLE_CHOICE="
if "!RUN_WIZARD!"=="1" call :guided_wizard

REM Flags override the wizard and saved answers; otherwise saved, then defaults.
if defined EXTRAS_FLAG set "EXTRAS_CHOICE=!EXTRAS_FLAG!"
if defined MODEL_INVOCABLE_FLAG set "INVOCABLE_CHOICE=!MODEL_INVOCABLE_FLAG!"
if not defined EXTRAS_CHOICE (
    if defined SAVED_EXTRAS (set "EXTRAS_CHOICE=!SAVED_EXTRAS!") else (set "EXTRAS_CHOICE=no")
)
if not defined INVOCABLE_CHOICE (
    if defined SAVED_INVOCABLE (set "INVOCABLE_CHOICE=!SAVED_INVOCABLE!") else (set "INVOCABLE_CHOICE=none")
)

REM Persist only when the wizard ran or a flag set something - silent re-runs
REM must not clobber saved answers with defaults.
set "DO_PERSIST=0"
if "!RUN_WIZARD!"=="1" set "DO_PERSIST=1"
if defined EXTRAS_FLAG set "DO_PERSIST=1"
if defined MODEL_INVOCABLE_FLAG set "DO_PERSIST=1"
if "!DO_PERSIST!"=="1" (
    if not exist "!_CONFIG_DIR!" mkdir "!_CONFIG_DIR!" >nul 2>&1
    > "!PREFS_FILE!" (
        echo extras=!EXTRAS_CHOICE!
        echo model_invocable=!INVOCABLE_CHOICE!
    )
)

REM Extras install is delegated to the skills CLI (its UI picks the agents).
REM Interactive wizard runs only - silent runs and CI get the printed command.
REM Never runs when the extras already exist. The extras ARE skills, so
REM --skip-skills suppresses them too - a saved extras=yes preference must not
REM smuggle a skill install past the opt-out.
if "!SKIP_SKILLS!"=="0" if "!EXTRAS_CHOICE!"=="yes" if "!EXTRAS_PRESENT!"=="0" (
    set "NPX_OK=0"
    where npx >nul 2>&1
    if !ERRORLEVEL! equ 0 if "!RUN_WIZARD!"=="1" set "NPX_OK=1"
    if "!NPX_OK!"=="1" (
        echo Launching the skills CLI for the extras ^(pick your agents in its UI^)...
        call npx skills add ahmadghoniem/Hypermark/apps/skills/extra --global
        if not !ERRORLEVEL! equ 0 echo skills CLI did not complete - install later with: npx skills add ahmadghoniem/Hypermark/apps/skills/extra --global
    ) else (
        echo Install the extras with: npx skills add ahmadghoniem/Hypermark/apps/skills/extra --global
    )
)

REM File-copy installs require git (sparse checkout). Hard requirement: without
REM git we cannot install the /hypermark-* skills, so fail loudly instead of
REM leaving a partial install. Hook/config writing above has already run.
REM
REM Skills/commands opt-out (--skip-skills / HYPERMARK_SKIP_SKILLS_INSTALL /
REM skipInstall.skills). HONEST reporting like the per-agent family: the skipped
REM state is announced, and skip means do-not-write - nothing already on disk in
REM any skill or command scope is fetched, replaced, or removed on this run.
REM Nothing is fetched, so git also stops being a requirement here.
if "!SKIP_SKILLS!"=="1" (
    echo.
    echo Skills: skipped ^(!SKIP_SKILLS_SOURCE!^).
    echo No skills or slash commands were fetched, and none already installed
    echo were changed or removed. The /hypermark-* commands are NOT installed
    echo by this run - re-run without the opt-out to install them.
) else (
    where git >nul 2>&1
    if not !ERRORLEVEL! equ 0 (
        echo Error: git is required to install Hypermark's skills and slash commands. 1>&2
        echo Install git, then run this installer again. 1>&2
        echo To install without them, re-run with --skip-skills. 1>&2
        exit /b 1
    )
)
set "CHECKOUT_FAILED=0"
set "SKILLS_TMP=%TEMP%\hypermark-skills-%RANDOM%"
REM git's stderr is captured OUTSIDE SKILLS_TMP (which is removed before the
REM failure message prints) so a failed clone can show the real git error
REM (#1238) instead of only the generic "network or git error" line.
set "GIT_ERR_FILE=%TEMP%\hypermark-git-stderr-%RANDOM%.txt"
mkdir "!SKILLS_TMP!" >nul 2>&1

REM Opt-out: jump past the clone so no network call is made and
REM CHECKOUT_FAILED stays 0 - an opt-out is not a fetch failure and must not
REM trip the guard below. Reported above, next to the git check.
if "!SKIP_SKILLS!"=="1" goto skills_checkout_done

set "CLONE_OK=0"
set "SPARSE_CLONE=1"
REM LC_ALL=C pins git's error strings to English for the capability probe
REM below: a localized git would emit a translated "unknown option" message
REM the findstr match misses, sending old-git non-English users to a hard
REM failure instead of the fallback. Saved and restored around the probe.
set "HYPERMARK_SAVED_LC_ALL=!LC_ALL!"
set "LC_ALL=C"
git clone --depth 1 --filter=blob:none --sparse "https://github.com/!REPO!.git" --branch "!TAG!" "!SKILLS_TMP!\repo" >nul 2>"!GIT_ERR_FILE!"
if !ERRORLEVEL! equ 0 set "CLONE_OK=1"
set "LC_ALL=!HYPERMARK_SAVED_LC_ALL!"
set "HYPERMARK_SAVED_LC_ALL="

REM Capability probe, not a version parse (same philosophy as the GitButler
REM flag probing in packages/shared/gitbutler-core.ts): `git clone --sparse`
REM needs git >= 2.25, and an older git rejects the flag instantly with
REM "error: unknown option `sparse'" before any network call (#1238). Fall
REM back to a plain shallow clone - it costs download size, not correctness:
REM every path the copy steps below read is present in the full checkout, and
REM `git sparse-checkout set` (equally missing on that git) is skipped
REM because there is nothing to narrow.
set "SPARSE_UNSUPPORTED=0"
if "!CLONE_OK!"=="0" (
    findstr /i /c:"unknown option" "!GIT_ERR_FILE!" >nul 2>&1 && findstr /i /c:"sparse" "!GIT_ERR_FILE!" >nul 2>&1 && set "SPARSE_UNSUPPORTED=1"
)
if "!SPARSE_UNSUPPORTED!"=="1" (
    echo This git does not support "git clone --sparse" ^(needs git ^>= 2.25^) - falling back to a plain shallow clone.
    set "SPARSE_CLONE=0"
    if exist "!SKILLS_TMP!\repo" rmdir /s /q "!SKILLS_TMP!\repo" >nul 2>&1
    git clone --depth 1 "https://github.com/!REPO!.git" --branch "!TAG!" "!SKILLS_TMP!\repo" >nul 2>"!GIT_ERR_FILE!"
    if !ERRORLEVEL! equ 0 set "CLONE_OK=1"
)

if "!CLONE_OK!"=="1" (
    pushd "!SKILLS_TMP!\repo"
    if "!SPARSE_CLONE!"=="1" git sparse-checkout set apps/skills >nul 2>&1

    REM Claude Code reads apps\skills\claude\* (injection `!`hypermark ... $ARGUMENTS``
    REM + allowed-tools, so /hypermark-* run with no permission prompt); the
    REM shared-agent scope reads apps\skills\core\* (prose). The `!`...`` injection
    REM is Claude-Code-only, so the two are sourced separately and are NOT
    REM interchangeable. Replace on each run.
    if exist "apps\skills\claude" (
        if not exist "!CLAUDE_SKILLS_DIR!" mkdir "!CLAUDE_SKILLS_DIR!"
        for %%S in (hypermark-review hypermark-annotate hypermark-last) do (
            if exist "apps\skills\claude\%%S" (
                if exist "!CLAUDE_SKILLS_DIR!\%%S" rmdir /s /q "!CLAUDE_SKILLS_DIR!\%%S" >nul 2>&1
                xcopy /s /i /y /q "apps\skills\claude\%%S" "!CLAUDE_SKILLS_DIR!\%%S\" >nul 2>&1
            )
        )
        REM The hypermark knowledge skill (CLI reference) has no Claude-only
        REM injection form, so Claude installs the single-sourced core copy.
        if exist "apps\skills\core\hypermark" (
            if exist "!CLAUDE_SKILLS_DIR!\hypermark" rmdir /s /q "!CLAUDE_SKILLS_DIR!\hypermark" >nul 2>&1
            xcopy /s /i /y /q "apps\skills\core\hypermark" "!CLAUDE_SKILLS_DIR!\hypermark\" >nul 2>&1
        )
        echo Installed Claude Code skills to !CLAUDE_SKILLS_DIR!\
    )
    if exist "apps\skills\core" (
        if not exist "!AGENTS_SKILLS_DIR!" mkdir "!AGENTS_SKILLS_DIR!"
        for %%S in (hypermark-review hypermark-annotate hypermark-last hypermark) do (
            if exist "apps\skills\core\%%S" (
                REM Replace rather than merge so files removed upstream don't linger.
                if exist "!AGENTS_SKILLS_DIR!\%%S" rmdir /s /q "!AGENTS_SKILLS_DIR!\%%S" >nul 2>&1
                xcopy /s /i /y /q "apps\skills\core\%%S" "!AGENTS_SKILLS_DIR!\%%S\" >nul 2>&1
            )
        )
        echo Installed shared agent skills to !AGENTS_SKILLS_DIR!\
    ) else (
        echo Tag !TAG! predates the core/extra skill layout - skipping core skill install
    )

    popd
) else (
    set "CHECKOUT_FAILED=1"
)

:skills_checkout_done
rmdir /s /q "!SKILLS_TMP!" >nul 2>&1

if "!CHECKOUT_FAILED!"=="1" (
    echo Error: unable to fetch !REPO! at !TAG! ^(network or git error^). 1>&2
    if exist "!GIT_ERR_FILE!" (
        echo git reported: 1>&2
        type "!GIT_ERR_FILE!" 1>&2
        del /q "!GIT_ERR_FILE!" >nul 2>&1
    )
    echo Something went wrong - run the installer again. 1>&2
    exit /b 1
)
del /q "!GIT_ERR_FILE!" >nul 2>&1

REM Claude Code commands are deprecated in favor of skills. Remove a legacy
REM command file only once its replacement skill is actually on disk - running
REM AFTER the install above guarantees a failed or skipped skill install never
REM leaves users with neither the command nor the skill.
REM A skills opt-out installed no replacement this run, so it removes nothing
REM either - skip means do-not-write, never remove.
for %%C in (hypermark-review hypermark-annotate hypermark-last) do (
    if "!SKIP_SKILLS!"=="0" if exist "!CLAUDE_SKILLS_DIR!\%%C" if exist "!CLAUDE_COMMANDS_DIR!\%%C.md" (
        del /q "!CLAUDE_COMMANDS_DIR!\%%C.md" >nul 2>&1
        echo Removed deprecated Claude command !CLAUDE_COMMANDS_DIR!\%%C.md ^(replaced by the %%C skill^)
    )
)

REM Apply the saved model-invocation choices. Installed skill copies always
REM arrive locked (disable-model-invocation: true in SKILL.md); for each
REM chosen skill we unlock the INSTALLED copy by removing that line, and flip
REM the agents\openai.yaml sidecar's allow_implicit_invocation to match.
REM Re-applied on every run because installs replace the skill folders wholesale.
REM A skills opt-out installed no skill copies this run, so there is nothing to
REM unlock - and rewriting a PREVIOUS run's SKILL.md would be a write the
REM opt-out promised not to make.
if "!SKIP_SKILLS!"=="0" if defined INVOCABLE_CHOICE if not "!INVOCABLE_CHOICE!"=="none" (
    for %%K in ("!INVOCABLE_CHOICE:,=" "!") do (
        for %%D in ("!CLAUDE_SKILLS_DIR!" "!AGENTS_SKILLS_DIR!") do (
            if exist "%%~D\%%~K\SKILL.md" (
                findstr /c:"disable-model-invocation: true" "%%~D\%%~K\SKILL.md" >nul 2>&1
                if !ERRORLEVEL! equ 0 (
                    findstr /v /c:"disable-model-invocation: true" "%%~D\%%~K\SKILL.md" > "%%~D\%%~K\SKILL.md.tmp"
                    move /y "%%~D\%%~K\SKILL.md.tmp" "%%~D\%%~K\SKILL.md" >nul 2>&1
                    echo Enabled model invocation: %%~D\%%~K
                )
            )
            if exist "%%~D\%%~K\agents\openai.yaml" (
                findstr /c:"allow_implicit_invocation: false" "%%~D\%%~K\agents\openai.yaml" >nul 2>&1
                if !ERRORLEVEL! equ 0 (
                    powershell -NoProfile -Command "(Get-Content '%%~D\%%~K\agents\openai.yaml' -Raw) -replace 'allow_implicit_invocation: false','allow_implicit_invocation: true' | Set-Content '%%~D\%%~K\agents\openai.yaml' -NoNewline"
                )
            )
        )
    )
)

echo.
echo Test the install:
echo   echo {"tool_input":{"plan":"# Test Plan\\n\\nHello world"}} ^| hypermark
echo.
echo Then install the Claude Code plugin:
echo   /plugin marketplace add ahmadghoniem/Hypermark
echo   /plugin install hypermark@hypermark
echo.
echo Upgrading from an older version? Also run /plugin marketplace update
echo so the plugin drops its old hypermark:* command entries.
echo.
REM Never claim the /hypermark-* skills are ready when nothing was installed -
REM that false banner is exactly what the skills-checkout guard exists to prevent.
if "!SKIP_SKILLS!"=="1" (
    echo Skills were skipped ^(!SKIP_SKILLS_SOURCE!^), so the /hypermark-review,
    echo /hypermark-annotate, and /hypermark-last skills are NOT installed.
    echo Re-run the installer without the opt-out to add them.
) else (
    echo The /hypermark-review, /hypermark-annotate, and /hypermark-last skills are ready to use!
)
if "!SKIP_SKILLS!"=="0" if not "!EXTRAS_CHOICE!"=="yes" (
    echo.
    echo Optional skills ^(compound planning, setup-goal, visual explainer^):
    echo   npx skills add ahmadghoniem/Hypermark/apps/skills/extra --global
)

REM Warn if hypermark is configured in both settings.json hooks AND the plugin (causes double execution)
REM Only warn when the plugin is installed - manual-only users won't have overlap
if defined CLAUDE_CONFIG_DIR (
    set "CLAUDE_SETTINGS=%CLAUDE_CONFIG_DIR%\settings.json"
) else (
    set "CLAUDE_SETTINGS=%USERPROFILE%\.claude\settings.json"
)
if exist "!PLUGIN_HOOKS!" if exist "!CLAUDE_SETTINGS!" (
    findstr /r /c:"\"command\".*hypermark" "!CLAUDE_SETTINGS!" >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        echo.
        echo WARNING: DUPLICATE HOOK DETECTED
        echo.
        echo   hypermark was found in your settings.json hooks:
        echo   !CLAUDE_SETTINGS!
        echo.
        echo   This will cause hypermark to run TWICE on each plan review.
        echo   Remove the hypermark hook from settings.json and rely on the
        echo   plugin instead ^(installed automatically via marketplace^).
        echo.
    )
)

echo.
exit /b 0

REM ======================================================================
REM Print the PATH-setup hint if INSTALL_DIR isn't already on PATH. Called by
REM both the --minimal early exit and the normal flow (mirrors install.sh's
REM print_path_advice).
REM ======================================================================
:PrintPathAdvice
echo !PATH! | findstr /i /c:"!INSTALL_DIR!" >nul
if !ERRORLEVEL! neq 0 (
    echo.
    echo !INSTALL_DIR! is not in your PATH.
    echo.
    echo Add it permanently with:
    echo.
    echo   setx PATH "%%PATH%%;!INSTALL_DIR!"
    echo.
    echo Or add it for this session only:
    echo.
    echo   set PATH=%%PATH%%;!INSTALL_DIR!
)
echo.
echo To uninstall later: hypermark uninstall
goto :eof

REM ======================================================================
REM Optional annotate agent terminal runtime install. Non-fatal: Hypermark
REM remains installed if Node/npm or npm install is unavailable.
REM ======================================================================
:InstallAgentTerminalRuntime
if /i "!HYPERMARK_SKIP_AGENT_TERMINAL_INSTALL!"=="1" (
    echo Skipping agent terminal runtime install ^(HYPERMARK_SKIP_AGENT_TERMINAL_INSTALL is set^)
    goto :eof
)
if /i "!HYPERMARK_SKIP_AGENT_TERMINAL_INSTALL!"=="true" (
    echo Skipping agent terminal runtime install ^(HYPERMARK_SKIP_AGENT_TERMINAL_INSTALL is set^)
    goto :eof
)
if /i "!HYPERMARK_SKIP_AGENT_TERMINAL_INSTALL!"=="yes" (
    echo Skipping agent terminal runtime install ^(HYPERMARK_SKIP_AGENT_TERMINAL_INSTALL is set^)
    goto :eof
)

"!INSTALL_PATH!" install-runtime agent-terminal
if !ERRORLEVEL! neq 0 (
    echo Skipping agent terminal runtime install ^(hypermark install-runtime failed^)
)
goto :eof

REM ======================================================================
REM Opt-in CallDiff core install. Call flow is off by default, so a default
REM install never downloads even the pruned core. Review-specific packs
REM install in-app. Non-fatal when the opt-in install fails.
REM ======================================================================
:InstallCallFlowRuntime
if not "!INSTALL_CALL_FLOW!"=="1" (
    echo Call-flow analysis: available as an in-app opt-in install ^(enable Call flow in review Settings^), or run: hypermark install-runtime call-flow
    goto :eof
)

"!INSTALL_PATH!" install-runtime call-flow
if !ERRORLEVEL! neq 0 (
    echo Call-flow runtime install failed; it remains available as an in-app opt-in install
)
goto :eof

REM ======================================================================
REM Optional semantic diff sidecar install. Non-fatal: Hypermark remains
REM installed if sem download, checksum, or extraction fails.
REM ======================================================================
:InstallSemSidecar
if /i "!HYPERMARK_SKIP_SEM_INSTALL!"=="1" (
    echo Skipping semantic diff sidecar install ^(HYPERMARK_SKIP_SEM_INSTALL is set^)
    goto :eof
)
if /i "!HYPERMARK_SKIP_SEM_INSTALL!"=="true" (
    echo Skipping semantic diff sidecar install ^(HYPERMARK_SKIP_SEM_INSTALL is set^)
    goto :eof
)
if /i "!HYPERMARK_SKIP_SEM_INSTALL!"=="yes" (
    echo Skipping semantic diff sidecar install ^(HYPERMARK_SKIP_SEM_INSTALL is set^)
    goto :eof
)

set "SEM_ASSET="
if /i "!PLATFORM!"=="win32-x64" set "SEM_ASSET=sem-windows-x86_64.zip"
if not defined SEM_ASSET (
    echo Skipping semantic diff sidecar install ^(sem does not publish !PLATFORM!^)
    goto :eof
)

set "SEM_DIR=!_CONFIG_DIR!\vendor\sem\!SEM_VERSION!"
set "SEM_PATH=!SEM_DIR!\sem.exe"
if exist "!SEM_PATH!" (
    "!SEM_PATH!" --version 2>nul | findstr /r /c:"^sem " >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        echo Semantic diff sidecar already installed at !SEM_PATH!
        goto :eof
    )
)

set "SEM_BASE_URL=https://github.com/!SEM_REPO!/releases/download/!SEM_VERSION!"
set "SEM_ARCHIVE=%TEMP%\hypermark-sem-%RANDOM%.zip"
set "SEM_CHECKSUMS=%TEMP%\hypermark-sem-checksums-%RANDOM%.txt"
set "SEM_EXTRACT=%TEMP%\hypermark-sem-%RANDOM%"
mkdir "!SEM_EXTRACT!" >nul 2>&1

REM Bounded so a slow/hung download of this optional sidecar can't wedge an
REM install where hypermark already landed. Opt out with HYPERMARK_SKIP_SEM_INSTALL=1.
curl -fsSL --connect-timeout 10 --max-time 120 "!SEM_BASE_URL!/!SEM_ASSET!" -o "!SEM_ARCHIVE!"
if !ERRORLEVEL! neq 0 (
    echo Skipping semantic diff sidecar install ^(download failed^)
    goto :sem_cleanup
)

curl -fsSL --connect-timeout 10 --max-time 60 "!SEM_BASE_URL!/checksums.txt" -o "!SEM_CHECKSUMS!"
if !ERRORLEVEL! neq 0 (
    echo Skipping semantic diff sidecar install ^(checksum download failed^)
    goto :sem_cleanup
)

set "EXPECTED_SEM_CHECKSUM="
for /f "usebackq tokens=1,2" %%i in ("!SEM_CHECKSUMS!") do (
    if "%%j"=="!SEM_ASSET!" set "EXPECTED_SEM_CHECKSUM=%%i"
)
if not defined EXPECTED_SEM_CHECKSUM (
    echo Skipping semantic diff sidecar install ^(checksum missing for !SEM_ASSET!^)
    goto :sem_cleanup
)

set "ACTUAL_SEM_CHECKSUM="
for /f "skip=1 tokens=*" %%i in ('certutil -hashfile "!SEM_ARCHIVE!" SHA256') do (
    if not defined ACTUAL_SEM_CHECKSUM (
        set "ACTUAL_SEM_CHECKSUM=%%i"
        set "ACTUAL_SEM_CHECKSUM=!ACTUAL_SEM_CHECKSUM: =!"
    )
)
if /i "!ACTUAL_SEM_CHECKSUM!" neq "!EXPECTED_SEM_CHECKSUM!" (
    echo Skipping semantic diff sidecar install ^(checksum mismatch^)
    goto :sem_cleanup
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Force -Path $env:SEM_ARCHIVE -DestinationPath $env:SEM_EXTRACT"
if !ERRORLEVEL! neq 0 (
    echo Skipping semantic diff sidecar install ^(extract failed^)
    goto :sem_cleanup
)
set "EXTRACTED_SEM="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path $env:SEM_EXTRACT -Filter sem.exe -Recurse -File | Select-Object -First 1 -ExpandProperty FullName"`) do (
    set "EXTRACTED_SEM=%%i"
)
if not defined EXTRACTED_SEM (
    echo Skipping semantic diff sidecar install ^(binary missing from archive^)
    goto :sem_cleanup
)

if not exist "!SEM_DIR!" mkdir "!SEM_DIR!"
copy /y "!EXTRACTED_SEM!" "!SEM_PATH!" >nul
if !ERRORLEVEL! equ 0 (
    echo Semantic diff sidecar installed to !SEM_PATH!
) else (
    echo Skipping semantic diff sidecar install ^(copy failed^)
)

:sem_cleanup
if exist "!SEM_ARCHIVE!" del "!SEM_ARCHIVE!"
if exist "!SEM_CHECKSUMS!" del "!SEM_CHECKSUMS!"
if exist "!SEM_EXTRACT!" rmdir /s /q "!SEM_EXTRACT!"
goto :eof

REM ======================================================================
REM Guided-install wizard (called only on interactive first runs or with
REM --reconfigure). Sets EXTRAS_CHOICE and INVOCABLE_CHOICE.
REM ======================================================================
:guided_wizard
echo.
echo ==========================================
echo   HYPERMARK GUIDED INSTALL
echo ==========================================
echo.
if "!EXTRAS_PRESENT!"=="1" (
    echo Extra skills already installed - keeping them.
    set "EXTRAS_CHOICE=yes"
) else if defined EXTRAS_FLAG (
    REM Flag already answered this question - don't ask and then ignore.
    set "EXTRAS_CHOICE=!EXTRAS_FLAG!"
) else (
    set "DEF_EXTRAS=no"
    if defined SAVED_EXTRAS set "DEF_EXTRAS=!SAVED_EXTRAS!"
    set "ANSWER="
    set /p "ANSWER=Install the extra skills (compound planning, setup-goal, visual explainer)? [y/N] "
    set "EXTRAS_CHOICE=no"
    if /i "!ANSWER!"=="y" set "EXTRAS_CHOICE=yes"
    if /i "!ANSWER!"=="yes" set "EXTRAS_CHOICE=yes"
    if "!ANSWER!"=="" set "EXTRAS_CHOICE=!DEF_EXTRAS!"
)
if defined MODEL_INVOCABLE_FLAG (
    REM Flag already answered this question - don't ask and then ignore.
    set "INVOCABLE_CHOICE=!MODEL_INVOCABLE_FLAG!"
    goto :eof
)
set "ANSWER="
set /p "ANSWER=Make any skills callable by the model (instead of user-invoked only)? [y/N] "
set "WANT_INVOCABLE=no"
if /i "!ANSWER!"=="y" set "WANT_INVOCABLE=yes"
if /i "!ANSWER!"=="yes" set "WANT_INVOCABLE=yes"
if "!WANT_INVOCABLE!"=="no" (
    set "INVOCABLE_CHOICE=none"
    goto :eof
)
set "SKILL_COUNT=3"
set "SKILL_1=hypermark-review"
set "SKILL_2=hypermark-annotate"
set "SKILL_3=hypermark-last"
if "!EXTRAS_CHOICE!"=="yes" (
    set "SKILL_COUNT=6"
    set "SKILL_4=hypermark-compound"
    set "SKILL_5=hypermark-setup-goal"
    set "SKILL_6=hypermark-visual-explainer"
)
REM Preselect previously chosen skills. NOTE: no pipes here - each side of a
REM cmd pipe runs in a child without delayed expansion, so !vars! would pass
REM through literally. A substring-replace containment test avoids that trap.
set "PRESEL=,!SAVED_INVOCABLE!,"
for /l %%I in (1,1,!SKILL_COUNT!) do (
    set "SEL_%%I=0"
    if defined SAVED_INVOCABLE (
        for %%K in ("!SKILL_%%I!") do if not "!PRESEL:,%%~K,=!"=="!PRESEL!" set "SEL_%%I=1"
    )
)
:toggle_loop
echo.
for /l %%I in (1,1,!SKILL_COUNT!) do (
    set "MARK= "
    if "!SEL_%%I!"=="1" set "MARK=x"
    echo   %%I^) [!MARK!] !SKILL_%%I!
)
set "PICK="
set /p "PICK=Toggle a number (press enter on empty input to confirm): "
if "!PICK!"=="" goto :collect_invocable
set "VALID=0"
for /l %%I in (1,1,!SKILL_COUNT!) do if "!PICK!"=="%%I" set "VALID=1"
if "!VALID!"=="0" (
    echo Invalid choice: !PICK!
    goto :toggle_loop
)
for %%I in (!PICK!) do (
    if "!SEL_%%I!"=="1" (set "SEL_%%I=0") else (set "SEL_%%I=1")
)
goto :toggle_loop
:collect_invocable
set "INVOCABLE_CHOICE="
for /l %%I in (1,1,!SKILL_COUNT!) do (
    if "!SEL_%%I!"=="1" (
        if defined INVOCABLE_CHOICE (set "INVOCABLE_CHOICE=!INVOCABLE_CHOICE!,!SKILL_%%I!") else (set "INVOCABLE_CHOICE=!SKILL_%%I!")
    )
)
if not defined INVOCABLE_CHOICE set "INVOCABLE_CHOICE=none"
goto :eof
