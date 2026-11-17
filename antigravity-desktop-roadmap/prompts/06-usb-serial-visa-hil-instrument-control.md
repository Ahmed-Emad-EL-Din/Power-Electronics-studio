# Prompt 06: PC Hardware-in-the-Loop (HIL): USB/VISA Oscilloscope, Bode Analyzer & Live DSP Serial/CAN-FD Tuning

## Agent Role & Objective
You are an Embedded Power Control & Lab Instrumentation Engineer. One of the biggest advantages of a native Windows `.exe` over a browser app is unrestricted access to the PC's physical USB, Serial (COM), Ethernet (LXI/VXI-11), and CAN-FD interfaces. You will build a **Hardware-in-the-Loop (HIL) & Lab Bench Bridge** (`src-tauri/src/hardware_hil/`) that connects PowerStage Studio directly to:
1. **Bench Oscilloscopes & Frequency Response Analyzers (SCPI over USB-TMC / TCP-IP LXI)**: Keysight, Tektronix, Rigol, Siglent, Rohde & Schwarz, and OMICRON Bode 100.
2. **Digital Power DSPs / MCUs (UART / USB-CDC / CAN-FD)**: Texas Instruments C2000 (`TMS320F280049C`, `F28379D`) and STMicroelectronics `STM32G474RE` (HRTIM) for live real-time 2p2z/3p3z digital compensator coefficient hot-swapping without reflashing firmware.

---

## Step-by-Step Implementation Instructions

### 1. Add Hardware I/O Crates to `src-tauri/Cargo.toml`
```toml
serialport = "4.5"
rusb = "0.9"
tokio-serial = "5.4"
crc = "3.2"
```

### 2. Implement SCPI Oscilloscope & Bode Analyzer Client (`src-tauri/src/hardware_hil/visa_scpi.rs`)
Build a transport-agnostic SCPI client supporting TCP/IP Socket (`192.168.x.x:5025` raw SCPI) and USB-TMC:
- **Auto-Discovery & Identification**: Send `*IDN?` and parse vendor, model, and firmware version.
- **Live Waveform Capture (`capture_scope_channels`)**:
  - Configure preamble (`:WAV:FORM BYTE`, `:WAV:MODE RAW`) and pull 100,000-point time-series buffers from CH1–CH4 ($V_{ds}$, $V_{gs}$, $I_{pri}$, $V_{out,\text{ripple}}$).
  - Scale raw ADC bytes using `:WAV:XINC?`, `:WAV:XOR?`, `:WAV:YINC?`, `:WAV:YOR?` into physical Volts and Amps.
  - Compute real-time hardware FFT ($150\text{ kHz} \dots 30\text{ MHz}$) and overlay the measured EMI spectrum directly onto the **EMI Filter Design Assistant** chart!
- **Measured Loop Gain Bode Import / Live Sweep**:
  - Support importing `.csv` / `.s2p` from OMICRON Bode 100 or running an automated stepped-sine frequency response sweep via an attached scope's built-in AWG +FRA (`:FRANalysis:RUN`, `:FRANalysis:DATA?`).
  - Overlay the **Measured Hardware Plant & Loop Bode Curve** ($|T_{meas}(j\omega)|$, $\angle T_{meas}(j\omega)$) directly on top of the analytical Bode & Nyquist plots in `SmallSignalDashboard.tsx`.

### 3. Implement Live Digital Compensator Telemetry & Coefficient Hot-Swap (`src-tauri/src/hardware_hil/dsp_serial_can.rs`)
In `SmallSignalDashboard.tsx`, the app already synthesizes discrete-time Tustin ($z$-domain) $B_0, B_1, B_2, B_3$ and $A_1, A_2, A_3$ coefficients for TI C2000 and STM32G474.
Now close the loop with real hardware over High-Speed UART (up to 2 Mbps) or USB-CDC:
- Define a deterministic, CRC-16-CCITT framing protocol (`[0xAA, 0x55, CMD_ID, PAYLOAD_LEN, ...IEEE754_FLOATS, CRC_LO, CRC_HI]`):
  - `CMD_WRITE_COMPENSATOR (0x10)`: Transmits new $\{b_0, b_1, b_2, b_3, a_1, a_2, a_3\}$ coefficients and output clamp limits $(u_{min}, u_{max})$. The DSP shadow-buffers them and swaps them atomically at the next PWM zero-crossing (`EPWM_SOCA` / `HRTIM_REP`).
  - `CMD_TRIGGER_LOAD_STEP (0x20)`: Commands an onboard electronic load switch or DAC reference step ($\Delta V_{ref}$ or $\Delta I_{load}$) and streams back 2,048 samples of internal ADC telemetry ($V_{out}[k]$, $I_L[k]$, $d[k]$) captured at $f_{sw}$ so the user sees the real hardware step response update live inside `SmallSignalDashboard.tsx`.

### 4. Generate Ready-to-Compile Companion DSP Telemetry Header (`powerstage_hil_slave.h`)
Include a self-contained, zero-dependency C header file generator (`powerstage_hil_slave.h`) in the UI so the user can drop 40 lines of C into their TI C2000 `sci_isr` or STM32G4 `DMA_RxCpltCallback` and immediately link their physical prototype board to PowerStage Studio.

---

## Verification Criteria
1. Include a built-in **"Virtual Loopback DSP & Scope Emulator"** mode in Rust so users and automated tests can verify the full SCPI waveform overlay and UART CRC-16 coefficient hot-swap workflow even when no physical USB hardware is plugged in.
2. Verify CRC-16 packet encoding/decoding and IEEE-754 float serialization in `src-tauri/src/hardware_hil/tests.rs`.
