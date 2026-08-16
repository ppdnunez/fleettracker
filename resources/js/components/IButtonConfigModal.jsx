import { useState } from 'react';
import {
    CommandLog, CommandModalShell, useDeviceCommands,
    btnPrimary, btnStyle, hintStyle, inputStyle, labelStyle, rowStyle, sectionStyle, sectionTitle, selectStyle,
} from './DeviceCommandPanel.jsx';

/**
 * Card Reader (iButton) configuration — VL863P Operational Commands Manual §8.6.
 *
 * Every control is a query/apply pair against the live device: Query asks what the device
 * currently holds, Apply pushes the values on screen. Nothing is stored here, because the device
 * is the authority on its own configuration — see DeviceCommandPanel for the SMS transport.
 */
export default function IButtonConfigModal({ imei, deviceName, device, onClose }) {
    const { sending, log, send, channel, setChannel } = useDeviceCommands(imei);

    const [swState, setSwState]     = useState('ON');
    const [authMode, setAuthMode]   = useState('0');
    const [bank, setBank]           = useState('1'); // '1' -> IBUTTON_ID (slots 1-10), '2' -> IBUTTON_ID2 (11-20)
    const [addNums, setAddNums]     = useState('');
    const [deleteSns, setDeleteSns] = useState('');
    const [deleteNum, setDeleteNum] = useState('');
    const [almState, setAlmState]   = useState('ON');
    const [almMethod, setAlmMethod] = useState('0');
    const [relayMode, setRelayMode] = useState('2');
    const [buzzState, setBuzzState] = useState('OFF');

    // Slots 11–20 live under a second command name rather than an index argument.
    const idCmd = bank === '1' ? 'IBUTTON_ID' : 'IBUTTON_ID2';

    // The device accepts at most ten values per call, so the list is trimmed rather than
    // silently truncated by the device with no indication of which ones were dropped.
    const csv = (raw) => raw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 10);

    const handleAdd          = () => { const n = csv(addNums);   if (n.length) send(`${idCmd},A,${n.join(',')}#`); };
    const handleDeleteBySn   = () => { const n = csv(deleteSns); if (n.length) send(`${idCmd},D,${n.join(',')}#`); };
    const handleDeleteByNum  = () => { if (deleteNum.trim()) send(`${idCmd},D,${deleteNum.trim()}#`); };

    return (
        <CommandModalShell title="iButton Configuration" imei={imei} deviceName={deviceName} device={device}
            width={560} onClose={onClose} channel={channel} setChannel={setChannel}>
            <div style={sectionStyle}>
                <p style={sectionTitle}>Card Reader System</p>
                <div style={rowStyle}>
                    <div>
                        <label style={labelStyle}>Function switch</label>
                        <select value={swState} onChange={e => setSwState(e.target.value)} style={selectStyle}>
                            <option value="ON">ON</option>
                            <option value="OFF">OFF</option>
                        </select>
                    </div>
                    <button disabled={sending} onClick={() => send('IBUTTON_SW#')} style={btnStyle(sending)}>Query</button>
                    <button disabled={sending} onClick={() => send(`IBUTTON_SW,${swState}#`)} style={btnPrimary(sending)}>Apply</button>
                </div>
            </div>

            <div style={sectionStyle}>
                <p style={sectionTitle}>Authentication Mode</p>
                <div style={rowStyle}>
                    <div>
                        <label style={labelStyle}>Mode</label>
                        <select value={authMode} onChange={e => setAuthMode(e.target.value)} style={{ ...selectStyle, width: 260 }}>
                            <option value="0">0 — Local authentication</option>
                            <option value="3">3 — Authentication disabled</option>
                        </select>
                    </div>
                    <button disabled={sending} onClick={() => send('IBUTTON_MODE#')} style={btnStyle(sending)}>Query</button>
                    <button disabled={sending} onClick={() => send(`IBUTTON_MODE,${authMode}#`)} style={btnPrimary(sending)}>Apply</button>
                </div>
            </div>

            <div style={sectionStyle}>
                <p style={sectionTitle}>Whitelist (Add / Delete iButton)</p>
                <div style={{ ...rowStyle, marginBottom: 12 }}>
                    <div>
                        <label style={labelStyle}>Bank</label>
                        <select value={bank} onChange={e => setBank(e.target.value)} style={{ ...selectStyle, width: 200 }}>
                            <option value="1">Slots 1–10 (IBUTTON_ID)</option>
                            <option value="2">Slots 11–20 (IBUTTON_ID2)</option>
                        </select>
                    </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                    <label style={labelStyle}>Add card numbers (comma-separated, up to 10)</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input value={addNums} onChange={e => setAddNums(e.target.value)} placeholder="e.g. 1A2B3C4D, 5E6F7A8B" style={{ ...inputStyle, flex: 1 }} />
                        <button disabled={sending || !addNums.trim()} onClick={handleAdd} style={btnPrimary(sending || !addNums.trim())}>Add</button>
                    </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                    <label style={labelStyle}>Delete by sequence number (comma-separated, up to 10)</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input value={deleteSns} onChange={e => setDeleteSns(e.target.value)} placeholder="e.g. 1, 3, 5" style={{ ...inputStyle, flex: 1 }} />
                        <button disabled={sending || !deleteSns.trim()} onClick={handleDeleteBySn} style={btnStyle(sending || !deleteSns.trim())}>Delete</button>
                    </div>
                </div>

                <div>
                    <label style={labelStyle}>Delete by card number</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input value={deleteNum} onChange={e => setDeleteNum(e.target.value)} placeholder="e.g. 1A2B3C4D" style={{ ...inputStyle, flex: 1 }} />
                        <button disabled={sending || !deleteNum.trim()} onClick={handleDeleteByNum} style={btnStyle(sending || !deleteNum.trim())}>Delete</button>
                    </div>
                </div>
            </div>

            <div style={sectionStyle}>
                <p style={sectionTitle}>Unauthorized iButton Alert</p>
                <div style={rowStyle}>
                    <div>
                        <label style={labelStyle}>Function switch</label>
                        <select value={almState} onChange={e => setAlmState(e.target.value)} style={selectStyle}>
                            <option value="ON">ON</option>
                            <option value="OFF">OFF</option>
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Reporting method</label>
                        <select value={almMethod} onChange={e => setAlmMethod(e.target.value)} disabled={almState === 'OFF'} style={{ ...selectStyle, width: 180 }}>
                            <option value="0">0 — GPRS only</option>
                            <option value="1">1 — GPRS + SMS</option>
                        </select>
                    </div>
                    <button disabled={sending} onClick={() => send('IBUTTON_ALM#')} style={btnStyle(sending)}>Query</button>
                    {/* OFF takes no reporting method — sending one is rejected by the device. */}
                    <button disabled={sending} onClick={() => send(almState === 'OFF' ? 'IBUTTON_ALM,OFF#' : `IBUTTON_ALM,ON,${almMethod}#`)} style={btnPrimary(sending)}>Apply</button>
                </div>
            </div>

            <div style={sectionStyle}>
                <p style={sectionTitle}>Relay Action on iButton Tap</p>
                <div style={rowStyle}>
                    <div>
                        <label style={labelStyle}>Linkage mode</label>
                        <select value={relayMode} onChange={e => setRelayMode(e.target.value)} style={{ ...selectStyle, width: 320 }}>
                            <option value="0">0 — Disabled (no linkage)</option>
                            <option value="1">1 — Tap-to-enable, Tap-to-disable</option>
                            <option value="2">2 — Tap-to-enable, ACC-to-disable</option>
                        </select>
                    </div>
                    <button disabled={sending} onClick={() => send('IBUTTON_CTL#')} style={btnStyle(sending)}>Query</button>
                    <button disabled={sending} onClick={() => send(`IBUTTON_CTL,${relayMode}#`)} style={btnPrimary(sending)}>Apply</button>
                </div>
                <p style={hintStyle}>
                    Modes 1–2 require the card reader enabled, authentication mode 0, and at least one whitelisted iButton —
                    otherwise the device lets any iButton operate the vehicle.
                </p>
            </div>

            <div style={{ ...sectionStyle, marginBottom: 0 }}>
                <p style={sectionTitle}>Buzzer Feedback</p>
                <div style={rowStyle}>
                    <div>
                        <label style={labelStyle}>State</label>
                        <select value={buzzState} onChange={e => setBuzzState(e.target.value)} style={selectStyle}>
                            <option value="ON">ON</option>
                            <option value="OFF">OFF</option>
                        </select>
                    </div>
                    <button disabled={sending} onClick={() => send('IBUTTON_BUZZ#')} style={btnStyle(sending)}>Query</button>
                    <button disabled={sending} onClick={() => send(`IBUTTON_BUZZ,${buzzState}#`)} style={btnPrimary(sending)}>Apply</button>
                </div>
            </div>

            <CommandLog log={log} />
        </CommandModalShell>
    );
}
