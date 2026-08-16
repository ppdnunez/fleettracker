import { useState } from 'react';
import {
    CommandLog, CommandModalShell, NumField, SwitchAndMethod, useDeviceCommands,
    btnPrimary, btnStyle, hintStyle, rowStyle, sectionStyle, sectionTitle,
} from './DeviceCommandPanel.jsx';

/**
 * Driving Behaviour Alerts — VL863P Operational Commands Manual §6.7.
 *
 * Covers Overspeed, Harsh Acceleration/Deceleration, Harsh Cornering, Collision, Rollover and
 * Fatigue Driving. Each is query-then-apply against the live device over SMS, with no local copy:
 * these are device-side thresholds, and the device is the only place they exist. Defaults below
 * are the manual's, so an untouched panel sends what the device already expects.
 */
export default function DrivingBehaviorAlertModal({ imei, deviceName, device, onClose }) {
    const { sending, log, send, channel, setChannel } = useDeviceCommands(imei);

    // §6.7.1 Overspeed — SPEED,P1,P2,P3,P4#
    const [spEnabled, setSpEnabled] = useState('ON');
    const [spMethod, setSpMethod]   = useState('0');
    const [spSpeed, setSpSpeed]     = useState(100);
    const [spWindow, setSpWindow]   = useState(10);

    // §6.7.2 Harsh Acceleration/Deceleration — SPEEDCHECK,P1,P2,P3,P4,P5#
    const [scEnabled, setScEnabled] = useState('OFF');
    const [scMethod, setScMethod]   = useState('0');
    const [scWindow, setScWindow]   = useState(4);
    const [scAccel, setScAccel]     = useState(30);
    const [scDecel, setScDecel]     = useState(50);

    // §6.7.3 Harsh Cornering — SWERVE,P1,P2,P3,P4,P5#
    const [swEnabled, setSwEnabled] = useState('OFF');
    const [swMethod, setSwMethod]   = useState('0');
    const [swAngle, setSwAngle]     = useState(30);
    const [swSpeed, setSwSpeed]     = useState(60);
    const [swWindow, setSwWindow]   = useState(3);

    // §6.7.4 Collision — COLLIDE,P1,P2,P3,P4,P5,P6#
    const [clEnabled, setClEnabled]   = useState('OFF');
    const [clMethod, setClMethod]     = useState('0');
    const [clImpact, setClImpact]     = useState(480);
    const [clDropWin, setClDropWin]   = useState(10);
    const [clStillWin, setClStillWin] = useState(90);
    const [clStillSpd, setClStillSpd] = useState(5);

    // §6.7.5 Rollover — ROLLOVER,P1,P2,P3,P4# (needs Collision enabled on the device)
    const [rlEnabled, setRlEnabled] = useState('OFF');
    const [rlMethod, setRlMethod]   = useState('0');
    const [rlGforce, setRlGforce]   = useState(15);
    const [rlWindow, setRlWindow]   = useState(20);

    // §6.7.6 Fatigue Driving (Overtime) — OVERTIME,P1,P2,P3,P4#
    const [otEnabled, setOtEnabled]   = useState('ON');
    const [otMethod, setOtMethod]     = useState('0');
    const [otMaxDrive, setOtMaxDrive] = useState(240);
    const [otMinRest, setOtMinRest]   = useState(30);

    return (
        <CommandModalShell title="Driving Behavior Alerts" imei={imei} deviceName={deviceName} device={device}
            width={640} onClose={onClose} channel={channel} setChannel={setChannel}>
            <div style={sectionStyle}>
                <p style={sectionTitle}>Overspeed Alert</p>
                <div style={rowStyle}>
                    <SwitchAndMethod enabled={spEnabled} setEnabled={setSpEnabled} method={spMethod} setMethod={setSpMethod} />
                    <NumField label="Speed threshold (km/h)" value={spSpeed} onChange={setSpSpeed} min={1} max={255} />
                    <NumField label="Detection window (s)" value={spWindow} onChange={setSpWindow} min={5} max={600} />
                    <button disabled={sending} onClick={() => send('SPEED#')} style={btnStyle(sending)}>Query</button>
                    <button disabled={sending} onClick={() => send(`SPEED,${spEnabled},${spMethod},${spSpeed},${spWindow}#`)} style={btnPrimary(sending)}>Apply</button>
                </div>
                <p style={hintStyle}>Triggers if speed continuously exceeds the threshold for the full detection window.</p>
            </div>

            <div style={sectionStyle}>
                <p style={sectionTitle}>Harsh Acceleration / Deceleration Alert</p>
                <div style={rowStyle}>
                    <SwitchAndMethod enabled={scEnabled} setEnabled={setScEnabled} method={scMethod} setMethod={setScMethod} />
                    <NumField label="Detection window (s)" value={scWindow} onChange={setScWindow} min={1} max={30} />
                    <NumField label="Acceleration threshold (km/h)" value={scAccel} onChange={setScAccel} min={10} max={300} width={120} />
                    <NumField label="Deceleration threshold (km/h)" value={scDecel} onChange={setScDecel} min={10} max={300} width={120} />
                    <button disabled={sending} onClick={() => send('SPEEDCHECK#')} style={btnStyle(sending)}>Query</button>
                    <button disabled={sending} onClick={() => send(`SPEEDCHECK,${scEnabled},${scMethod},${scWindow},${scAccel},${scDecel}#`)} style={btnPrimary(sending)}>Apply</button>
                </div>
                <p style={hintStyle}>Triggers if GPS speed changes by more than the threshold within the detection window (either direction).</p>
            </div>

            <div style={sectionStyle}>
                <p style={sectionTitle}>Harsh Cornering Alert</p>
                <div style={rowStyle}>
                    <SwitchAndMethod enabled={swEnabled} setEnabled={setSwEnabled} method={swMethod} setMethod={setSwMethod} />
                    <NumField label="Heading change threshold (°)" value={swAngle} onChange={setSwAngle} min={10} max={180} width={140} />
                    <NumField label="Speed threshold (km/h)" value={swSpeed} onChange={setSwSpeed} min={10} max={200} />
                    <NumField label="Detection window (s)" value={swWindow} onChange={setSwWindow} min={1} max={30} />
                    <button disabled={sending} onClick={() => send('SWERVE#')} style={btnStyle(sending)}>Query</button>
                    <button disabled={sending} onClick={() => send(`SWERVE,${swEnabled},${swMethod},${swAngle},${swSpeed},${swWindow}#`)} style={btnPrimary(sending)}>Apply</button>
                </div>
                <p style={hintStyle}>Triggers when speed is at/above the threshold and heading changes by more than the angle within the detection window.</p>
            </div>

            <div style={sectionStyle}>
                <p style={sectionTitle}>Collision Alert</p>
                <div style={rowStyle}>
                    <SwitchAndMethod enabled={clEnabled} setEnabled={setClEnabled} method={clMethod} setMethod={setClMethod} />
                    <NumField label="Impact level threshold" value={clImpact} onChange={setClImpact} min={10} max={1024} width={110} />
                    <NumField label="Speed-drop window (s)" value={clDropWin} onChange={setClDropWin} min={3} max={20} />
                    <NumField label="Stationary check window (s)" value={clStillWin} onChange={setClStillWin} min={10} max={90} width={140} />
                    <NumField label="Stationary speed (km/h)" value={clStillSpd} onChange={setClStillSpd} min={5} max={30} width={120} />
                    <button disabled={sending} onClick={() => send('COLLIDE#')} style={btnStyle(sending)}>Query</button>
                    <button disabled={sending} onClick={() => send(`COLLIDE,${clEnabled},${clMethod},${clImpact},${clDropWin},${clStillWin},${clStillSpd}#`)} style={btnPrimary(sending)}>Apply</button>
                </div>
                <p style={hintStyle}>
                    Valid only when GPS speed was above 5 km/h at impact. Prone to false alarms if the vehicle hits a large speed
                    bump and stops within the drop window.
                </p>
            </div>

            <div style={sectionStyle}>
                <p style={sectionTitle}>Rollover Alert</p>
                <div style={rowStyle}>
                    <SwitchAndMethod enabled={rlEnabled} setEnabled={setRlEnabled} method={rlMethod} setMethod={setRlMethod} />
                    <NumField label="G-force change (× 0.1g)" value={rlGforce} onChange={setRlGforce} min={1} max={40} width={130} />
                    <NumField label="Detection window (s)" value={rlWindow} onChange={setRlWindow} min={1} max={90} />
                    <button disabled={sending} onClick={() => send('ROLLOVER#')} style={btnStyle(sending)}>Query</button>
                    <button disabled={sending} onClick={() => send(`ROLLOVER,${rlEnabled},${rlMethod},${rlGforce},${rlWindow}#`)} style={btnPrimary(sending)}>Apply</button>
                </div>
                <p style={hintStyle}>Requires Collision Alert (above) to be enabled on the device — otherwise this setting has no effect.</p>
            </div>

            <div style={{ ...sectionStyle, marginBottom: 0 }}>
                <p style={sectionTitle}>Fatigue Driving Alert (Overtime)</p>
                <div style={rowStyle}>
                    <SwitchAndMethod enabled={otEnabled} setEnabled={setOtEnabled} method={otMethod} setMethod={setOtMethod} />
                    <NumField label="Max continuous driving (min)" value={otMaxDrive} onChange={setOtMaxDrive} min={10} max={1440} width={150} />
                    <NumField label="Min rest time (min)" value={otMinRest} onChange={setOtMinRest} min={10} max={1440} width={120} />
                    <button disabled={sending} onClick={() => send('OVERTIME#')} style={btnStyle(sending)}>Query</button>
                    <button disabled={sending} onClick={() => send(`OVERTIME,${otEnabled},${otMethod},${otMaxDrive},${otMinRest}#`)} style={btnPrimary(sending)}>Apply</button>
                </div>
                <p style={hintStyle}>Alert resets once ACC has been off for the configured rest time.</p>
            </div>

            <CommandLog log={log} />
        </CommandModalShell>
    );
}
