// Mixxx resolves this script prefix from QJSEngine's global object.
// eslint-disable-next-line no-var
var NumarkNS6 = {};

// =======================================================
// Global state and safeguards
// =======================================================
NumarkNS6.isBooting = true; // Ignore controller feedback during startup.
NumarkNS6.animTimer = 0;
NumarkNS6.parachuteTimer = 0;
NumarkNS6.startupWakeTimer = 0;
NumarkNS6.blinkTimer = 0;
NumarkNS6.displayTimer = 0;
NumarkNS6.navTimer = 0;
NumarkNS6.pendingTimers = [];
NumarkNS6.shuttingDown = false;
NumarkNS6.beginOneShot = function(delay, callback, onCancel) {
    const pending = {id: 0, onCancel: onCancel};
    pending.id = engine.beginTimer(delay, function() {
        const index = NumarkNS6.pendingTimers.indexOf(pending);
        if (index === -1) { return; }
        NumarkNS6.pendingTimers.splice(index, 1);
        if (!NumarkNS6.shuttingDown) { callback(); }
    }, true);
    NumarkNS6.pendingTimers.push(pending);
};
NumarkNS6.ledCache = {};
NumarkNS6.ledRefreshMs = 2000;
NumarkNS6.sendLed = function(status, control, value) {
    const key = `${status  }:${  control}`;
    const now = Date.now();
    const previous = NumarkNS6.ledCache[key];
    if (previous && previous.value === value && now - previous.sentAt < NumarkNS6.ledRefreshMs) { return; }
    midi.sendShortMsg(status, control, value);
    NumarkNS6.ledCache[key] = {value: value, sentAt: now};
};
NumarkNS6.refreshDeckLeds = function(deckNum) {
    const deck = NumarkNS6.Decks[deckNum];
    if (!deck) { return; }
    const status = 0xB0 + deck.midiChannel;
    delete NumarkNS6.ledCache[`${status  }:7`];
    delete NumarkNS6.ledCache[`${status  }:8`];
    delete NumarkNS6.ledCache[`${status  }:9`];
    NumarkNS6.updatePlayCueLEDs(deckNum, deck.midiChannel);
    NumarkNS6.updateSyncLED(deckNum, deck.midiChannel);
};
NumarkNS6.crossfaderChanged = false;
NumarkNS6.activePFLDeck = 0;

NumarkNS6.Decks = [];
NumarkNS6.jogMSB = [0, 0, 0, 0, 0];
NumarkNS6.jogLSB = [0, 0, 0, 0, 0];
NumarkNS6.lastJogValue = [-1, -1, -1, -1, -1];
// Short diagnostic counters: report at touch release instead of logging every
// high-rate jog packet. This makes it possible to compare Mixxx's input path
// with the raw MIDI Monitor trace without flooding the log during scratching.
NumarkNS6.jogMidiDiag = [null, null, null, null, null];
// Keep a tiny raw MIDI window and print it only when the reconstructed jog
// position has an outlier. This helps separate incoming CC jumps from pairing
// effects when combining the 7-bit MSB/LSB values.
NumarkNS6.jogTraceDeltaThreshold = 96;
NumarkNS6.jogTraceHistoryLength = 12;
NumarkNS6.jogTraceFutureEvents = 6;
NumarkNS6.debug = false;
NumarkNS6.recordJogMidiTrace = function(diag, ctrl, val, fullValue, delta) {
    if (!diag) { return; }
    const entry = `${Date.now() - diag.startedAt  }ms ${
        ctrl === 0x00 ? "MSB" : "LSB"  }=${  val
    } pos=${  fullValue  }${delta === null ? "" : ` d=${  delta}`}`;
    diag.rawEventHistory.push(entry);
    if (diag.rawEventHistory.length > NumarkNS6.jogTraceHistoryLength) { diag.rawEventHistory.shift(); }
    if (diag.pendingRawTrace) {
        diag.pendingRawTrace.push(entry);
        diag.pendingRawTraceEvents--;
        if (diag.pendingRawTraceEvents <= 0) { NumarkNS6.flushJogMidiTrace(diag); }
    }
};
NumarkNS6.flushJogMidiTrace = function(diag) {
    if (!diag || !diag.pendingRawTrace) { return; }
    if (NumarkNS6.debug) {
        print(`NS6 jog raw delta trace deck=${  diag.deckNum  } sequence=${  diag.pendingRawTrace.join(" | ")}`);
    }
    diag.pendingRawTrace = null;
    diag.pendingRawTraceEvents = 0;
};
NumarkNS6.lastJogRingValue = [0, 0, 0, 0, 0];
NumarkNS6.lastTouchStripValue = [null, 0, 0, 0, 0];
NumarkNS6.deckLoopMode = [null, true, true, true, true];
NumarkNS6.harmonicSyncActive = [null, false, false, false, false];
NumarkNS6.isProcessingHarmonic = [null, false, false, false, false];
// Common Serato-style tempo ranges: fine beatmatching, wider correction,
// and an extended range for large tempo changes.
NumarkNS6.rateRanges = [0.08, 0.16, 0.50];
// Fine pitch keeps the current rate as its anchor and applies a fraction of
// each physical fader movement.
NumarkNS6.finePitchSensitivity = 0.25;
NumarkNS6.finePitchParameterStep = function(currentParameter, previousFaderParameter, nextFaderParameter, sensitivity) {
    if (previousFaderParameter === undefined) { return currentParameter; }
    return Math.max(0, Math.min(1, currentParameter + (nextFaderParameter - previousFaderParameter) * sensitivity));
};
// On the original NS6, CC 0x3C / 0x3D drive the pitch-up/down arrows.
// The NS6II uses different Note On LEDs, so do not copy its 0x09/0x0A protocol.
NumarkNS6.pitchTakeoverLED = {OFF: 0x00, DIM: 0x40, FULL: 0x7F, UP: 0x3C, DOWN: 0x3D};
NumarkNS6.pitchSyncToleranceBpm = 0.02;
NumarkNS6.pitchSyncArrowValues = function(deckBpm, otherDeckBpm) {
    const off = NumarkNS6.pitchTakeoverLED.OFF;
    if (deckBpm <= 0 || otherDeckBpm <= 0) { return {up: off, down: off}; }
    const difference = deckBpm - otherDeckBpm;
    if (Math.abs(difference) <= NumarkNS6.pitchSyncToleranceBpm) { return {up: off, down: off}; }
    const brightness = Math.abs(difference) < 0.10 ? NumarkNS6.pitchTakeoverLED.DIM : NumarkNS6.pitchTakeoverLED.FULL;
    // The NS6's physical arrows are wired with the opposite orientation to
    // Mixxx's signed effective-BPM difference; this mapping follows the
    // direction confirmed against the controller's pitch-bend arrows.
    return difference < 0 ? {up: off, down: brightness} : {up: brightness, down: off};
};
// Map Mixxx channel groups to deck numbers.
NumarkNS6.groupToDeck = {"[Channel1]": 1, "[Channel2]": 2, "[Channel3]": 3, "[Channel4]": 4};
// Mixxx Preferences > Controllers > Numark NS6 > Start Time. Zero preserves
// the mapping's existing instant PLAY behavior; positive values use softStart.
const configuredPlayStartFactor = (typeof engine.getSetting === "function")
    ? Number(engine.getSetting("playStartFactor")) : 0;
NumarkNS6.playStartFactor = isFinite(configuredPlayStartFactor) ? configuredPlayStartFactor : 0;
NumarkNS6.toggleDeckPlay = function(deckNum, group) {
    const deck = NumarkNS6.Decks[deckNum];
    const currentlyPlaying = deck && typeof deck.transportWantsPlay === "boolean"
        ? deck.transportWantsPlay : engine.getValue(group, "play") > 0;
    print(`NS6 PLAY toggle deck=${  deckNum  } live=${  engine.getValue(group, "play") > 0 ? 1 : 0
    } intent=${  currentlyPlaying ? 1 : 0  } action=${  currentlyPlaying ? "pause" : "start"}`);
    if (currentlyPlaying) {
        if (deck) { deck.transportWantsPlay = false; }
        engine.setValue(group, "play", 0);
    } else if (NumarkNS6.playStartFactor > 0) {
        if (deck) { deck.transportWantsPlay = true; }
        engine.softStart(deckNum, true, NumarkNS6.playStartFactor);
    } else {
        if (deck) { deck.transportWantsPlay = true; }
        engine.setValue(group, "play", 1);
    }
};
NumarkNS6.resetTransportIntentForCue = function(deck) {
    if (!deck) { return; }
    deck.transportWantsPlay = false;
    deck.scratchResumeIntent = false;
    deck.wasPlayingBeforeScratch = false;
};
NumarkNS6.syncTransportIntentAfterTrackLoad = function(deck, group) {
    if (!deck) { return; }
    const playing = engine.getValue(group, "play") > 0;
    deck.transportWantsPlay = playing;
    deck.scratchResumeIntent = playing;
    deck.wasPlayingBeforeScratch = playing;
    print(`NS6 transport sync after track load deck=${  deck.deckNum  } play=${  playing ? 1 : 0}`);
};
NumarkNS6.syncTransportIntentAfterCue = function(deck, group) {
    if (!deck) { return; }
    if (deck.cueIntentSyncTimer !== undefined && deck.cueIntentSyncTimer !== 0) {
        engine.stopTimer(deck.cueIntentSyncTimer);
    }
    deck.cueIntentSyncTimer = engine.beginTimer(120, function() {
        deck.cueIntentSyncTimer = 0;
        const playing = engine.getValue(group, "play") > 0;
        deck.transportWantsPlay = playing;
        deck.scratchResumeIntent = playing;
        deck.wasPlayingBeforeScratch = playing;
        print(`NS6 cue transport sync deck=${  deck.deckNum  } play=${  playing ? 1 : 0}`);
    }, true);
};
// PFL buttons 1-4 map directly to Mixxx decks 1-4.
NumarkNS6.pflGroupMap = {1: 1, 2: 2, 3: 3, 4: 4};
NumarkNS6.pflGroupForChannel = function(channel) {
    return `[Channel${  NumarkNS6.pflGroupMap[channel] || channel  }]`;
};

// The NS6 PFL buttons latch: Note On selects the deck and the next Note Off clears it.
NumarkNS6.setPFL = function(channel, enabled) {
    const group = NumarkNS6.pflGroupForChannel(channel);
    if (enabled) {
        for (let deckNum = 1; deckNum <= 4; deckNum++) {
            const deckGroup = `[Channel${  deckNum  }]`;
            engine.setValue(deckGroup, "pfl", deckGroup === group ? 1 : 0);
        }
        NumarkNS6.activePFLDeck = NumarkNS6.pflGroupMap[channel];
    } else {
        engine.setValue(group, "pfl", 0);
        if (NumarkNS6.activePFLDeck === NumarkNS6.pflGroupMap[channel]) { NumarkNS6.activePFLDeck = 0; }
    }
};
NumarkNS6.pflButtonInput = function(channel, value, status) {
    const message = status & 0xF0;
    if (message === 0x90 && value > 0) {
        NumarkNS6.setPFL(channel, true);
    } else if (message === 0x80 || (message === 0x90 && value === 0)) {
        NumarkNS6.setPFL(channel, false);
    }
};

NumarkNS6.blinkState = 0;
NumarkNS6.blinkInterval = 1000;
NumarkNS6.encoderResolution = 0.05;
NumarkNS6.resetHotCuePageOnTrackLoad = true;
NumarkNS6.cueReverseRoll = true;
NumarkNS6.hotcuePageIndexBehavior = true;

// The NS6 sends 14-bit platter positions. A virtual resolution of 2,048 ticks
// per physical rotation gives a natural scratch response in Mixxx.
NumarkNS6.scratchSettings = {"alpha": 1.0/8, "beta": (1.0/8)/32, "jogResolution": 2048, "vinylSpeed": 33.33};
// Mixxx Preferences > Controllers > Numark NS6 > Scratch Sensitivity.
const configuredScratchSensitivity = (typeof engine.getSetting === "function")
    ? Number(engine.getSetting("scratchSensitivity")) : 50;
NumarkNS6.scratchSensitivity = isFinite(configuredScratchSensitivity)
    ? Math.max(25, Math.min(100, configuredScratchSensitivity)) : 50;
NumarkNS6.scratchDeltaForDjaySensitivity = function(delta) {
    return delta * (NumarkNS6.scratchSensitivity / 100);
};
// In 5 ms, 768 steps would exceed 560 RPM. Larger jumps are USB noise rather
// than plausible platter movement.
NumarkNS6.maxJogDelta = 768;
NumarkNS6.pitchBendSensitivity = 5; // Lower values produce stronger pitch bends.
NumarkNS6.repairPlayRelease = function(deck, group, ctrl, value) {
    if (!deck.playPressed) { return; }
    deck.playPressed = false;
    print(`NS6 play malformed Note Off deck=${  deck.deckNum  } bytes=${  ctrl  }/${  value}`);
};
// The NS6 can also emit the same malformed 0x8n 0x7D 0x7D packet instead of
// the jog touch Note Off (0x8n 0x2C 0x00). Either Note Off ends the touch;
// movement is not required because a stationary hold must release too. This
// shares the existing XML binding with the PLAY release repair and ignores
// unrelated Bn 7D 7D control-change packets.
NumarkNS6.repairMalformedJogRelease = function(deck, ctrl, value, group) {
    if (!deck || !deck.jogTouched) { return false; }
    print(`NS6 jog malformed Note Off deck=${  deck.deckNum  } bytes=${  ctrl  }/${  value}`);
    NumarkNS6.jogTouch14bit(0, ctrl, 0, 0, group);
    return true;
};
// The controller can emit the same malformed 0x8n 0x7D 0x7D packet for
// PLAY, CUE, or jog-touch release. Route it once and repair whichever latches
// are active instead of registering two XML handlers for the same MIDI bytes.
NumarkNS6.repairMalformedTransportRelease = function(deck, group, ctrl, value) {
    if (!deck) { return; }
    if (deck.cuePressed && typeof deck.releaseCue === "function") {
        print(`NS6 cue malformed Note Off deck=${  deck.deckNum  } bytes=${  ctrl  }/${  value}`);
        deck.releaseCue(group, "repaired");
    }
    NumarkNS6.repairPlayRelease(deck, group, ctrl, value);
    NumarkNS6.repairMalformedJogRelease(deck, ctrl, value, group);
};
// Filter electrical/software duplicate Note Owns only when they arrive almost
// simultaneously. A later Note On can be a fast new tap even if the prior
// Note Off was delayed or lost by the device/USB path.
NumarkNS6.acceptPlayPress = function(deck, now) {
    if (deck.playPressed && now - deck.lastPlayPressAt < 50) { return false; }
    deck.playPressed = true;
    deck.lastPlayPressAt = now;
    return true;
};
// The NS6 may continue sending platter positions after touch note-off. Handoff
// occurs only after this interval without a valid position update.
NumarkNS6.scratchReleaseDelayMs = 60;
NumarkNS6.scratchPlaybackRecoveryMs = 100;
// Match Mixstream Pro's default threshold for continuing a forward or reverse
// platter spin after touch-off (Mixxx speed units).
NumarkNS6.spinReleaseRateThreshold = 1.5;
NumarkNS6.backspinRampStartRate = 0.75;
NumarkNS6.backspinAccelerationWindowMs = 120;
// A fast release is only a spin candidate. Confirm real platter travel after
// touch-off; brief flicks hand playback back on the short quiet interval.
NumarkNS6.spinCandidateQuietMs = 100;
NumarkNS6.spinMinCoastMs = 100;
NumarkNS6.spinMinCoastDelta = 32;
NumarkNS6.recordJogRate = function(deck, rate, now) {
    if (!deck.jogRateSamples) { deck.jogRateSamples = []; }
    deck.jogRateSamples.push({rate: rate, time: now});
    const cutoff = now - NumarkNS6.backspinAccelerationWindowMs;
    while (deck.jogRateSamples.length > 2 && deck.jogRateSamples[0].time < cutoff) { deck.jogRateSamples.shift(); }
};
NumarkNS6.getJogAcceleration = function(deck) {
    const samples = deck.jogRateSamples || [];
    if (samples.length < 2) { return null; }
    const first = samples[0], last = samples[samples.length - 1];
    const elapsed = last.time - first.time;
    if (elapsed <= 0 || elapsed > NumarkNS6.backspinAccelerationWindowMs) { return null; }
    return (last.rate - first.rate) * 1000 / elapsed;
};

// Volume faders use full 14-bit values. Permit real large moves, especially
// the final travel to zero; rejecting a large MSB delta leaves a stale MSB
// combined with new LSB packets and can make the fader jump back up.
NumarkNS6.reconnectBurst = (function() {
    let pendingZeros = {};
    let zeroControls = {};
    const lastValues = {};
    let settleTimer = 0;
    let activeTimer = 0;
    let active = false;
    let hasSeenPosition = false;

    /**
     *
     */
    const flushZeros = function() {
        settleTimer = 0;
        const pending = pendingZeros;
        pendingZeros = {};
        zeroControls = {};
        Object.keys(pending).forEach(function(key) {
            pending[key]();
            lastValues[key] = 0;
        });
    };

    /**
     *
     */
    const finishBurst = function() {
        activeTimer = 0;
        active = false;
        flushZeros();
    };

    return {
        handle: function(key, value, apply) {
            if (active) {
                if (value !== 0) {
                    delete pendingZeros[key];
                    apply();
                    lastValues[key] = value;
                } else if (!Object.prototype.hasOwnProperty.call(lastValues, key) || lastValues[key] !== 0) {
                    pendingZeros[key] = apply;
                }
                return;
            }
            if (value !== 0) {
                hasSeenPosition = true;
                delete pendingZeros[key];
                delete zeroControls[key];
                if (Object.keys(zeroControls).length === 0 && settleTimer) {
                    engine.stopTimer(settleTimer);
                    settleTimer = 0;
                }
                apply();
                lastValues[key] = value;
                return;
            }
            if (!hasSeenPosition) {
                apply();
                lastValues[key] = value;
                return;
            }
            zeroControls[key] = true;
            if (!Object.prototype.hasOwnProperty.call(lastValues, key) || lastValues[key] !== 0) {
                pendingZeros[key] = apply;
            }
            if (Object.keys(zeroControls).length >= 8) {
                if (settleTimer) { engine.stopTimer(settleTimer); }
                settleTimer = 0;
                zeroControls = {};
                active = true;
                activeTimer = engine.beginTimer(100, finishBurst, true);
            } else if (!settleTimer) {
                settleTimer = engine.beginTimer(50, flushZeros, true);
            }
        },
        isActive: function() { return active; },
        cancel: function() {
            if (settleTimer) { engine.stopTimer(settleTimer); }
            if (activeTimer) { engine.stopTimer(activeTimer); }
            settleTimer = activeTimer = 0;
            pendingZeros = {};
            zeroControls = {};
            active = false;
            hasSeenPosition = false;
            Object.keys(lastValues).forEach(function(key) { delete lastValues[key]; });
        }
    };
})();

NumarkNS6.guardAnalogInput = function(key, value, apply) {
    NumarkNS6.reconnectBurst.handle(key, value, apply);
};

NumarkNS6.makeVolumeFader = function(channel) {
    const state = {msb: 0, lsb: 0, initialized: false};
    const write = function() {
        engine.setValue(`[Channel${  channel  }]`, "volume", ((state.msb << 7) | state.lsb) / 16383.0);
    };
    return {
        inputMSB: function(ch, ctrl, value) {
            state.msb = value;
            state.initialized = true;
            write();
        },
        inputLSB: function(ch, ctrl, value) {
            state.lsb = value;
            if (state.initialized) { write(); }
        },
    };
};
for (let volumeChannel = 1; volumeChannel <= 4; volumeChannel++) {
    NumarkNS6[`deck${  volumeChannel  }Volume`] = NumarkNS6.makeVolumeFader(volumeChannel);
    const fader = NumarkNS6[`deck${  volumeChannel  }Volume`];
    NumarkNS6[`deck${  volumeChannel  }VolumeMSB`] = function(ch, ctrl, value) { fader.inputMSB(ch, ctrl, value); };
    NumarkNS6[`deck${  volumeChannel  }VolumeLSB`] = function(ch, ctrl, value) { fader.inputLSB(ch, ctrl, value); };
}

NumarkNS6.absolute14Bit = function(group, key, transform, writeValue) {
    const id = `14bit:${  group  }:${  key}`;
    const control = {
        msb: 0, lsb: 0, initialized: false,
        write: function() {
            const value = ((this.msb << 7) | this.lsb) / 16383.0;
            if (writeValue) { writeValue(value); }
            else { engine.setValue(group, key, transform ? transform(value) : value); }
        },
        inputMSB: function(ch, ctrl, value) {
            this.msb = value;
            this.initialized = true;
            this.write();
        },
        inputLSB: function(ch, ctrl, value) {
            this.lsb = value;
            if (this.initialized) { this.write(); }
        }
    };
    const inputMSB = control.inputMSB;
    const inputLSB = control.inputLSB;
    control.inputMSB = function(ch, ctrl, value) {
        NumarkNS6.guardAnalogInput(`${  id  }:msb`, value, function() { inputMSB.call(control, ch, ctrl, value); });
    };
    control.inputLSB = function(ch, ctrl, value) {
        NumarkNS6.guardAnalogInput(`${  id  }:lsb`, value, function() { inputLSB.call(control, ch, ctrl, value); });
    };
    return control;
};

NumarkNS6.headMixPosition = NumarkNS6.absolute14Bit("[Master]", "headMix", function(value) { return (value * 2) - 1; });
NumarkNS6.headMixMSB = function(ch, ctrl, value) { NumarkNS6.headMixPosition.inputMSB(ch, ctrl, value); };
NumarkNS6.headMixLSB = function(ch, ctrl, value) { NumarkNS6.headMixPosition.inputLSB(ch, ctrl, value); };

NumarkNS6.filteredPot14Bit = function(options) {
    const pot = new components.Pot(options);
    const id = `filtered-pot:${  options.midi[0]  }:${  options.midi[1]}`;
    const inputMSB = pot.inputMSB;
    const inputLSB = pot.inputLSB;
    pot.inputMSB = function(ch, ctrl, value, status, group) {
        NumarkNS6.guardAnalogInput(`${  id  }:msb`, value, function() {
            inputMSB.call(pot, ch, ctrl, value, status, group);
        });
    };
    pot.inputLSB = function(ch, ctrl, value, status, group) {
        NumarkNS6.guardAnalogInput(`${  id  }:lsb`, value, function() {
            inputLSB.call(pot, ch, ctrl, value, status, group);
        });
    };
    return pot;
};

NumarkNS6.protectPotStartupState = function(pot) {
    const inputMSB = pot.inputMSB;
    const inputLSB = pot.inputLSB;
    const state = {initialized: false, msbArgs: null, lsbArgs: null, lastLSBArgs: null, timer: 0};
    /**
     *
     */
    const commit = function() {
        state.timer = 0;
        if (state.msbArgs) { inputMSB.apply(pot, state.msbArgs); }
        if (state.lsbArgs) {
            inputLSB.apply(pot, state.lsbArgs);
            state.lastLSBArgs = state.lsbArgs;
        }
        state.msbArgs = null;
        state.lsbArgs = null;
        state.initialized = true;
    };
    /**
     *
     */
    const stage = function() {
        if (state.timer) { engine.stopTimer(state.timer); }
        state.timer = engine.beginTimer(50, commit, true);
    };
    pot.inputMSB = function() {
        const args = Array.prototype.slice.call(arguments);
        if (!state.initialized || state.timer || args[2] === 0) {
            if (state.initialized && !state.timer && args[2] === 0) {
                state.lsbArgs = state.lastLSBArgs ? state.lastLSBArgs.slice() : args.slice();
                if (!state.lastLSBArgs) { state.lsbArgs[1] += 0x20; }
                state.lsbArgs[2] = 0;
            }
            state.msbArgs = args;
            stage();
            return;
        }
        return inputMSB.apply(pot, args);
    };
    pot.inputLSB = function() {
        const args = Array.prototype.slice.call(arguments);
        if (!state.initialized || state.timer) {
            state.lsbArgs = args;
            stage();
            return;
        }
        state.lastLSBArgs = args;
        return inputLSB.apply(pot, args);
    };
    pot.cancelStartupTimer = function() {
        if (state.timer) { engine.stopTimer(state.timer); }
        state.timer = 0;
    };
    const startupInputMSB = pot.inputMSB;
    const startupInputLSB = pot.inputLSB;
    pot.inputMSB = function() {
        const args = Array.prototype.slice.call(arguments);
        NumarkNS6.guardAnalogInput(`pitch:${  args[0]  }:${  args[1]}`, args[2], function() {
            startupInputMSB.apply(pot, args);
        });
    };
    pot.inputLSB = function() {
        const args = Array.prototype.slice.call(arguments);
        NumarkNS6.guardAnalogInput(`pitch:${  args[0]  }:${  args[1]}`, args[2], function() {
            startupInputLSB.apply(pot, args);
        });
    };
    return pot;
};

NumarkNS6.masterGain = function(ch, ctrl, value) {
    NumarkNS6.guardAnalogInput("masterGain", value, function() {
        engine.setParameter("[Master]", "gain", value <= 64 ? value / 128.0 : (value - 1) / 126.0);
    });
};
NumarkNS6.headGain = function(ch, ctrl, value) {
    NumarkNS6.guardAnalogInput("headGain", value, function() {
        engine.setParameter("[Master]", "headGain", value <= 64 ? value / 128.0 : (value - 1) / 126.0);
    });
};

// The NS6 X-Fader knob is the crossfader-slope control, separate from the
// crossfader's physical position (CC 7/39). Match the reciprocal scale used
// by Mixxx's crossfader preference slider.
NumarkNS6.xFaderCurveForMidiValue = function(value) {
    const normalized = Math.max(0, Math.min(127, value)) / 127.0;
    return 1000.0 / ((1.0 - normalized) * 999.0 + 1.0) - 1.0 + 0.6;
};
NumarkNS6.setXfaderCurve = function(channel, control, value) {
    NumarkNS6.guardAnalogInput("xfaderCurve", value, function() {
        NumarkNS6.applyXfaderCurve(value);
    });
};
NumarkNS6.applyXfaderCurve = function(value) {
    const curve = NumarkNS6.xFaderCurveForMidiValue(value);
    const calibration = Math.pow(0.5, 1.0 / curve);
    // Keep the non-scratch profile current so the existing contour switch
    // returns to the knob's latest setting.
    NumarkNS6.storedCrossfaderParams.xFaderCurve = curve;
    NumarkNS6.storedCrossfaderParams.xFaderCalibration = calibration;

    // Keep the scratch contour active while updating the saved regular curve.
    if (!(NumarkNS6.Mixer && NumarkNS6.Mixer.changeCrossfaderContour && NumarkNS6.Mixer.changeCrossfaderContour.state)) {
        engine.setValue("[Mixer Profile]", "xFaderCurve", curve);
        engine.setValue("[Mixer Profile]", "xFaderCalibration", calibration);
    }
};
// The physical crossfader remains its own 14-bit control on CC 7/39.
// Full-range and fast crossfader movement is valid input; spike filtering can
// otherwise reject a real endpoint and leave the crossfader stuck mid-travel.
NumarkNS6.crossfader = NumarkNS6.absolute14Bit("[Master]", "crossfader", function(value) {
    return (value * 2.0) - 1.0;
});
NumarkNS6.crossfaderMSB = function(channel, control, value) {
    NumarkNS6.crossfader.inputMSB(channel, control, value);
};
NumarkNS6.crossfaderLSB = function(channel, control, value) {
    NumarkNS6.crossfader.inputLSB(channel, control, value);
};
NumarkNS6.FXMixLeft = NumarkNS6.absolute14Bit("[EffectRack1_EffectUnit1_Effect1]", "meta", null, function(value) {
    if (engine.getSetting("performanceFX") !== false) {
        engine.setParameter("[EffectRack1_EffectUnit1]", "mix", value);
    } else {
        engine.setParameter("[EffectRack1_EffectUnit1_Effect1]", engine.getSetting("singleEffect") ? "parameter1" : "meta", value);
    }
});
NumarkNS6.FXMixRight = NumarkNS6.absolute14Bit("[EffectRack1_EffectUnit2_Effect1]", "meta", null, function(value) {
    if (engine.getSetting("performanceFX") !== false) {
        engine.setParameter("[EffectRack1_EffectUnit2]", "mix", value);
    } else {
        engine.setParameter("[EffectRack1_EffectUnit2_Effect1]", engine.getSetting("singleEffect") ? "parameter1" : "meta", value);
    }
});
NumarkNS6.FXMixLeftMSB = function(ch, ctrl, value) { NumarkNS6.FXMixLeft.inputMSB(ch, ctrl, value); };
NumarkNS6.FXMixLeftLSB = function(ch, ctrl, value) { NumarkNS6.FXMixLeft.inputLSB(ch, ctrl, value); };
NumarkNS6.FXMixRightMSB = function(ch, ctrl, value) { NumarkNS6.FXMixRight.inputMSB(ch, ctrl, value); };
NumarkNS6.FXMixRightLSB = function(ch, ctrl, value) { NumarkNS6.FXMixRight.inputLSB(ch, ctrl, value); };
// Replay the vendor initialization sequence for every session so the original
// NS6 enters control mode and accepts MIDI feedback.
NumarkNS6.SysExInit1 = [0xF0, 0x00, 0x01, 0x3F, 0x7F, 0x79, 0x50, 0x00, 0x10, 0x04, 0x01, 0x00, 0x00, 0x00, 0x04, 0x04, 0x0E, 0x0F, 0x00, 0x00, 0x0E, 0x05, 0x0F, 0x04, 0x0C, 0x06, 0x0B, 0x0F, 0x0D, 0x0C, 0xF7];
NumarkNS6.SysExInit2 = [0xF0, 0x00, 0x01, 0x3F, 0x7F, 0x79, 0x60, 0x00, 0x01, 0x49, 0x01, 0x00, 0x00, 0x00, 0x00, 0xF7];

NumarkNS6.scratchXFader = {xFaderMode: 0, xFaderCurve: 999.60, xFaderCalibration: 1.0};

NumarkNS6.toggleEffects = function(channel, control, value, _status, _group) {
    // Trigger only on button press (value 127/0x7F), not on release (value 0).
    if (value === 127) {
        NumarkNS6.toggleSkinControl(NumarkNS6.skinKeys().effects);
    }
};

// =======================================================
// 🚥 PLAY, CUE, AND SYNC STATUS LEDs
// =======================================================

NumarkNS6.updatePlayCueLEDs = function(deckNum, midiChannel) {
    if (NumarkNS6.isBooting) { return; } // 🛡️ Bloqueia durante a animação
    // var group = "[Channel" + deckNum + "]";

    const deck = NumarkNS6.Decks[deckNum];
    if (!deck) { return; }

    const group = deck.group;
    const statusCC = 0xB0 + midiChannel;

    const trackLoaded = engine.getValue(group, "track_loaded") > 0;
    if (!trackLoaded) {
        NumarkNS6.sendLed(statusCC, 0x09, 0x00);
        NumarkNS6.sendLed(statusCC, 0x08, 0x00);
        return;
    }

    const isPlaying = engine.getValue(group, "play") > 0;
    const isCueing = engine.getValue(group, "cue_default") > 0;


    NumarkNS6.sendLed(statusCC, 0x09, isPlaying ? 0x7F : NumarkNS6.blinkState);
    if (isCueing) { NumarkNS6.sendLed(statusCC, 0x08, 0x7F); } else if (isPlaying) { NumarkNS6.sendLed(statusCC, 0x08, 0x00); } else {
        let atCue = false;
        const playPos = engine.getValue(group, "playposition");
        const cuePoint = engine.getValue(group, "cue_point");
        const trackSamples = engine.getValue(group, "track_samples");
        if (trackSamples > 0 && cuePoint !== -1) { if (Math.abs((playPos * trackSamples) - cuePoint) < 5000) { atCue = true; } } else if (playPos <= 0.005) { atCue = true; }
        NumarkNS6.sendLed(statusCC, 0x08, atCue ? 0x7F : NumarkNS6.blinkState);
    }
};

NumarkNS6.updateSyncLED = function(deckNum, midiChannel) {
    if (NumarkNS6.isBooting) { return; }
    const group = `[Channel${  deckNum  }]`;
    const deck = NumarkNS6.Decks[deckNum];
    if (!deck) { return; }


    if (!engine.getValue(group, "sync_enabled")) { NumarkNS6.sendLed(0xB0 + midiChannel, 0x07, 0x00); return; }

    const isPlaying = engine.getValue(group, "play") > 0, beatActive = engine.getValue(group, "beat_active") > 0;
    NumarkNS6.sendLed(0xB0 + midiChannel, 0x07, isPlaying ? (beatActive ? 0x7F : 0x00) : 0x7F);
};

NumarkNS6.updateReverseLED = function(deckNum) {
    if (NumarkNS6.isBooting || !NumarkNS6.Decks[deckNum]) { return; }
    midi.sendShortMsg(0xB0 + NumarkNS6.Decks[deckNum].midiChannel, 0x16, (engine.getValue(`[Channel${  deckNum  }]`, "reverse") || engine.getValue(`[Channel${  deckNum  }]`, "reverseroll")) ? 1 : 0);
};


// =======================================================
// 💿 PLATTER MOTOR AND STRIP SEARCH (LED ring rotation)
// =======================================================

NumarkNS6.updateJogRing = function(deckNum) {
    if (NumarkNS6.isBooting || !NumarkNS6.Decks[deckNum]) { return; }

    // 1. Get the deck this callback belongs to.
    const deck = NumarkNS6.Decks[deckNum];

    // 2. Read the values already cached in memory.
    const group = deck.group;
    const mChan = deck.midiChannel;

    const duration = engine.getValue(group, "duration");
    const playPos = engine.getValue(group, "playposition");

    if (duration <= 0 || engine.getValue(group, "track_loaded") === 0) {
        if (NumarkNS6.lastJogRingValue[deckNum] !== 0) {
            midi.sendShortMsg(0xB0 + mChan, 0x3A, 0x00);
            NumarkNS6.lastJogRingValue[deckNum] = 0;
        }
        return;
    }

    // 3. Use bitwise OR instead of Math.floor() to reduce CPU usage.
    const calc = (((playPos * duration) / 1.8) % 1 * 21) | 0;
    const ledIndex = Math.max(1, Math.min(21, calc + 1));

    // ⚡ Ask Mixxx directly whether the warning time has been reached.
    const isWarning = engine.getValue(group, "end_of_track") > 0;

    // At the end (isWarning), alternate between off and the LED at offset 0x40.
    const finalValue = isWarning ? (NumarkNS6.blinkState === 0 ? 0x00 : (ledIndex + 0x40)) : ledIndex;

    if (NumarkNS6.lastJogRingValue[deckNum] !== finalValue) {
        midi.sendShortMsg(0xB0 + mChan, 0x3A, finalValue);
        NumarkNS6.lastJogRingValue[deckNum] = finalValue;
    }
};

NumarkNS6.updateTouchStrip = function(value, group) {
    if (NumarkNS6.isBooting) { return; }
    const deckNum = script.deckFromGroup(group);
    if (!NumarkNS6.Decks[deckNum]) { return; }

    let ledValue = Math.min(15, Math.floor(value * 14) + 1);
    if (engine.getValue(group, "track_loaded") === 0) { ledValue = 0; }

    if (NumarkNS6.lastTouchStripValue[deckNum] === ledValue) { return; }
    NumarkNS6.lastTouchStripValue[deckNum] = ledValue;
    midi.sendShortMsg(0xB0 + NumarkNS6.Decks[deckNum].midiChannel, 0x4E, ledValue);
};


// =======================================================
// ⏱️ TIMER MANAGEMENT
// =======================================================

// =======================================================
// ⏱️ TIMER MANAGEMENT
// =======================================================

NumarkNS6.startTimers = function() {
    if (NumarkNS6.blinkTimer === 0) {
        NumarkNS6.blinkTimer = engine.beginTimer(500, function() {
            NumarkNS6.blinkState = (NumarkNS6.blinkState === 0) ? 0x7F : 0;

            for (let i = 1; i <= 4; i++) {
                if (NumarkNS6.Decks[i]) {
                    // 1. Update the hardware LEDs.
                    NumarkNS6.updatePlayCueLEDs(i, NumarkNS6.Decks[i].midiChannel);
                    NumarkNS6.updateSyncLED(i, NumarkNS6.Decks[i].midiChannel);

                }
            }
        });
    }

    if (NumarkNS6.displayTimer === 0) {
        NumarkNS6.displayTimer = engine.beginTimer(100, function() {
            for (let i = 1; i <= 4; i++) {
                if (NumarkNS6.Decks[i]) {
                    const group = `[Channel${  i  }]`;
                    NumarkNS6.updateTouchStrip(engine.getValue(group, "playposition"), group);
                }
            }
        });
    }
};


// =======================================================
// ⚙️ BASE MIDI COMPONENT CLASSES
// =======================================================

components.Encoder.prototype.input = function(_c, _ctrl, value) { this.inSetParameter(this.inGetParameter() + ((value === 0x01) ? NumarkNS6.encoderResolution : -NumarkNS6.encoderResolution)); };
components.Component.prototype.send = function(value) {
    if (this.midi === undefined || this.midi[0] === undefined || this.midi[1] === undefined) { return; }
    if (this.midi[2] === undefined) { this.midi[2] = this.midi[0]; }
    if (this.midi[3] === undefined) { this.midi[3] = this.midi[1]; }
    midi.sendShortMsg(this.midi[2], this.midi[3], value);
    if (this.sendShifted) {
        if (this.shiftChannel) { midi.sendShortMsg(this.midi[2] + this.shiftOffset, this.midi[3], value); } else if (this.shiftControl) { midi.sendShortMsg(this.midi[2], this.midi[3] + this.shiftOffset, value); }
    }
};

NumarkNS6.storedCrossfaderParams = {};
NumarkNS6.crossfaderCallbackConnections = [];
NumarkNS6.CrossfaderChangeCallback = function(value, group, control) { NumarkNS6.crossfaderChanged = true; NumarkNS6.storedCrossfaderParams[control] = value; };


// =======================================================
// 🚀 STANDARD INITIALIZATION (CLEAR ALL NOTES)
// =======================================================

NumarkNS6.init = function() {
    components.Button.prototype.isPress = function(ch, ctrl, val, st) {
        return NumarkNS6.pressed(val, st);
    };
    NumarkNS6.reconnectBurst.cancel();
    NumarkNS6.shuttingDown = false;
    NumarkNS6.isBooting = true; // Escudo Levantado!
    NumarkNS6.ledCache = {};
    NumarkNS6.lastBpmLed = -1;
    NumarkNS6.lastJogRingValue = [0, 0, 0, 0, 0];
    NumarkNS6.lastTouchStripValue = [null, 0, 0, 0, 0];

    midi.sendSysexMsg(NumarkNS6.SysExInit1, NumarkNS6.SysExInit1.length);
    midi.sendSysexMsg(NumarkNS6.SysExInit2, NumarkNS6.SysExInit2.length);

    // Ensure all layer states are cleared.
    midi.sendShortMsg(0x80, 0x31, 0x00);
    midi.sendShortMsg(0x80, 0x32, 0x00);
    midi.sendShortMsg(0x80, 0x33, 0x00);
    midi.sendShortMsg(0x80, 0x34, 0x00);

    NumarkNS6.Decks = [];
    for (let i = 1; i <= 4; i++) {
        // Start at the common ±8% range used by Serato DJ and many controllers.
        // The RANGE button cycles through ±8%, ±16%, and ±50%.
        engine.setValue(`[Channel${  i  }]`, "rateRange", NumarkNS6.rateRanges[0]);
        NumarkNS6.Decks[i] = new NumarkNS6.Deck(i);
        (function(dIdx) {
            const g = `[Channel${  dIdx  }]`;
            const mChan = NumarkNS6.Decks[dIdx].midiChannel;

            engine.makeConnection(g, "play", function() { NumarkNS6.updatePlayCueLEDs(dIdx, mChan); });
            engine.makeConnection(g, "playposition", function() { NumarkNS6.updateJogRing(dIdx); });
            engine.makeConnection(g, "sync_enabled", function() { NumarkNS6.updateSyncLED(dIdx, mChan); });
            engine.makeConnection(g, "reverse", function() { NumarkNS6.updateReverseLED(dIdx); });
            engine.makeConnection(g, "reverseroll", function() { NumarkNS6.updateReverseLED(dIdx); });
            engine.makeConnection(g, "beat_active", function() { NumarkNS6.updateSyncLED(dIdx, mChan); });
            engine.makeConnection(g, "track_loaded", function(v) {
                NumarkNS6.updateJogRing(dIdx);
                if (v > 0) {
                    NumarkNS6.updatePlayCueLEDs(dIdx, mChan);
                    NumarkNS6.updateAutoLoopLEDs(dIdx);
                    NumarkNS6.updateBpmMeter();
                }
            });
            engine.makeConnection(g, "loop_enabled", function(v) {
                if (!NumarkNS6.isBooting) { midi.sendShortMsg(0xB0 + dIdx, 0x15, v ? 0x7F : 0x00); }
                NumarkNS6.updateAutoLoopLEDs(dIdx);
            });
            engine.makeConnection(g, "beatloop_size", function() {
                NumarkNS6.updateAutoLoopLEDs(dIdx);
            });
            engine.makeConnection(g, "pfl", function(value) {
                if (value > 0) { NumarkNS6.activePFLDeck = dIdx; } else if (NumarkNS6.activePFLDeck === dIdx) { NumarkNS6.activePFLDeck = 0; }
            });
        })(i);
    }

    // BPM Connections
    engine.makeConnection("[Channel1]", "bpm", NumarkNS6.updateBpmMeter);
    engine.makeConnection("[Channel2]", "bpm", NumarkNS6.updateBpmMeter);
    engine.makeConnection("[Channel3]", "bpm", NumarkNS6.updateBpmMeter);
    engine.makeConnection("[Channel4]", "bpm", NumarkNS6.updateBpmMeter);
    // The BPM meter's `bpm` value is already rate-adjusted. Listening to
    // `rate` simply refreshes the LED strip for every pitch-fader movement;
    // it must not be multiplied into BPM again.
    engine.makeConnection("[Channel1]", "rate", NumarkNS6.updateBpmMeter);
    engine.makeConnection("[Channel2]", "rate", NumarkNS6.updateBpmMeter);
    engine.makeConnection("[Channel3]", "rate", NumarkNS6.updateBpmMeter);
    engine.makeConnection("[Channel4]", "rate", NumarkNS6.updateBpmMeter);

    // Crossfader Connections
    Object.keys(NumarkNS6.scratchXFader).forEach(function(control) {
        const connectionObject = engine.makeConnection("[Mixer Profile]", control, NumarkNS6.CrossfaderChangeCallback.bind(this));
        if (connectionObject) {
            connectionObject.trigger();
            NumarkNS6.crossfaderCallbackConnections.push(connectionObject);
        }
    }.bind(this));


    NumarkNS6.Mixer = new NumarkNS6.MixerTemplate();
    NumarkNS6.FX.init();
    NumarkNS6.FX.initRouting();

    NumarkNS6.bootAnimation();

    print(`Numark NS6: layers initialized. Left deck ${  NumarkNS6.leftDeck  } | Right deck ${  NumarkNS6.rightDeck}`);
};



// =======================================================
// 🎇 VEGAS MODE: PROTECTED ANIMATION WITH ACTIVE SUPPRESSION
// =======================================================

// =======================================================
// 🎇 VEGAS MODE: PROTECTED ANIMATION WITH ACTIVE SUPPRESSION
// =======================================================

NumarkNS6.bootAnimation = function() {
    let step = 0;

    NumarkNS6.animTimer = engine.beginTimer(50, function() {
        step++;

        // 🛡️ ACTIVE SUPPRESSION
        midi.sendShortMsg(0x80, 0x31, 0x00); midi.sendShortMsg(0x80, 0x32, 0x00);
        midi.sendShortMsg(0x80, 0x33, 0x00); midi.sendShortMsg(0x80, 0x34, 0x00);
        for (let d = 1; d <= 4; d++) { midi.sendShortMsg(0xB0 + d, 0x18, 0x00); }

        if (step > 30) {
            engine.stopTimer(NumarkNS6.animTimer);
            NumarkNS6.animTimer = 0;
            return;
        }
        for (let i = 1; i <= 4; i++) {
            const deck = NumarkNS6.Decks[i];
            if (!deck) { continue; }
            const cc = 0xB0 + deck.midiChannel;
            const stripVal = (step <= 15) ? step : (30 - step);
            if (stripVal >= 1 && stripVal <= 15) { midi.sendShortMsg(cc, 0x4E, stripVal); }
            midi.sendShortMsg(cc, 0x3A, Math.min(21, step));
            if (step % 3 === 0) {
                const cueIndex = Math.floor(step / 3);
                if (cueIndex >= 1 && cueIndex <= 5) { midi.sendShortMsg(cc, 0x0A + cueIndex, 0x7F); }
            }
        }
    });

    NumarkNS6.parachuteTimer = engine.beginTimer(1600, function() {
        NumarkNS6.isBooting = false;
        NumarkNS6.parachuteTimer = 0;

        for (let d = 1; d <= 4; d++) {
            if (!NumarkNS6.Decks[d]) { continue; }
            const mChan = NumarkNS6.Decks[d].midiChannel;
            midi.sendShortMsg(0xB0 + mChan, 0x4E, 0x00);
            midi.sendShortMsg(0xB0 + mChan, 0x3A, 0x00);
            for (let h = 1; h <= 5; h++) { midi.sendShortMsg(0xB0 + mChan, 0x0A + h, 0x00); }

            for (let hc = 1; hc <= 5; hc++) {
                if (engine.getValue(`[Channel${  d  }]`, `hotcue_${  hc  }_position`) !== -1) {
                    midi.sendShortMsg(0xB0 + mChan, 0x0A + hc, 0x7F);
                }
            }
            NumarkNS6.updatePlayCueLEDs(d, mChan);
            NumarkNS6.updateSyncLED(d, mChan);
            NumarkNS6.updateJogRing(d);
            NumarkNS6.Decks[d].pitchLedHandler.trigger();
        }
        NumarkNS6.updateBpmMeter();

        // 🎯 INITIAL WAKE-UP (configured for four decks)
        var wakeTimerId = engine.beginTimer(300, function() {
            if (NumarkNS6.startupWakeTimer !== wakeTimerId || NumarkNS6.shuttingDown) { return; }
            NumarkNS6.startupWakeTimer = 0;

            for (let dIdx = 1; dIdx <= 4; dIdx++) {
                if (!NumarkNS6.Decks[dIdx]) { continue; }
                const mc = NumarkNS6.Decks[dIdx].midiChannel;
                midi.sendShortMsg(0xB0 + mc, 0x3B, 0x01); // Touch sensor ON
                midi.sendShortMsg(0xB0 + dIdx, 0x18, NumarkNS6.deckLoopMode[dIdx] ? 0x01 : 0x02);
                NumarkNS6.updateAutoLoopLEDs(dIdx); // Força os LEDs de 1, 2, 4, 8 a acenderem!
                midi.sendShortMsg(0xB0 + mc, 0x12, 0x7F); // Scratch LED ON
                NumarkNS6.Decks[dIdx].scratchMode = true;
            }

            NumarkNS6.FX.updateLEDs();
            NumarkNS6.FX.RoutingTable.forEach(function(cfg) {
                const active = engine.getValue("[EffectRack1_EffectUnit" + cfg.unit + "]", "group_" + cfg.target + "_enable");
                midi.sendShortMsg(0xB0, cfg.led, active ? 127 : 0);
            });
            NumarkNS6.syncLayerLEDs();
            NumarkNS6.startTimers();
            print("Numark NS6: startup complete; layer state synchronized.");
        }, true);
        NumarkNS6.startupWakeTimer = wakeTimerId;

    }, true);
};

// =======================================================
// 🎚️ MIXER AND GENERAL CONTAINER STRUCTURE
// =======================================================

// Global state used by the BPM meter to identify the visible decks.
NumarkNS6.physicalPitch = [];
NumarkNS6.leftDeck = 1;
NumarkNS6.rightDeck = 2;
NumarkNS6.navTarget = 3;
// Route panel shortcuts to the same controls as the buttons in the active skin.
NumarkNS6.skinKeys = function() {
    return engine.getSetting("traktmixxxRaw") && engine.getValue("[NS6Surface]", "installed") !== 1 ? {
        library: ["[Master]", "maximize_library"], decks: ["[DeckRow2]", "show_row"],
        effects: ["[EffectRack1]", "show"]
    } : {
        library: ["[Skin]", "show_maximized_library"], decks: ["[Skin]", "show_4decks"],
        effects: ["[Skin]", "show_effectrack"]
    };
};
NumarkNS6.toggleSkinControl = function(pair) {
    const state = engine.getValue(pair[0], pair[1]) ? 0 : 1;
    engine.setValue(pair[0], pair[1], state);
    return state;
};
NumarkNS6.toggleBigLibrary = function() {
    return NumarkNS6.toggleSkinControl(NumarkNS6.skinKeys().library);
};
NumarkNS6.focusLibraryWidget = function(widget) {
    if (widget === 2 || widget === 3) { NumarkNS6.navTarget = widget; }
    engine.setValue("[Library]", "focused_widget", widget);
};
NumarkNS6.navigateLibrary = function(direction) {
    const focusedWidget = engine.getValue("[Library]", "focused_widget");
    if (focusedWidget === 2 || focusedWidget === 3) { NumarkNS6.navTarget = focusedWidget; }
    if (focusedWidget === 0) { NumarkNS6.focusLibraryWidget(NumarkNS6.navTarget); }
    engine.setValue("[Library]", "MoveVertical", direction);
};
NumarkNS6.moveLibraryFocus = function(direction, backwards) {
    if (engine.getValue("[Library]", "focused_widget") === 0) {
        NumarkNS6.focusLibraryWidget(direction < 0 ? 2 : 3);
        NumarkNS6.updateNavLEDs();
    } else if (backwards) {
        engine.setValue("[Library]", "MoveFocusBackward", 1);
    } else {
        engine.setValue("[Library]", "MoveFocus", direction);
    }
};
NumarkNS6.sortIfShifted = function(column) {
    if (!NumarkNS6.Decks[NumarkNS6.leftDeck].shiftButton.state &&
            !NumarkNS6.Decks[NumarkNS6.rightDeck].shiftButton.state) { return false; }
    engine.setValue("[Library]", "sort_column_toggle", script.LIBRARY_COLUMNS[column]);
    return true;
};
NumarkNS6.updateNavLEDs = function() {
    const focusedWidget = engine.getValue("[Library]", "focused_widget");
    if (focusedWidget === 2 || focusedWidget === 3) { NumarkNS6.navTarget = focusedWidget; }
    const selectedWidget = NumarkNS6.navTarget;
    const lib = NumarkNS6.skinKeys().library;
    const isBigLibrary = engine.getValue(lib[0], lib[1]) > 0;
    NumarkNS6.sendLed(0xB0, 0x01, 0x7F); // VIEW
    NumarkNS6.sendLed(0xB0, 0x03, selectedWidget === 2 ? 0x7F : 0x00); // CRATES: tree/sidebar
    NumarkNS6.sendLed(0xB0, 0x04, isBigLibrary ? 0x7F : 0x00); // PREPARE: Big Library state
    NumarkNS6.sendLed(0xB0, 0x05, selectedWidget === 3 ? 0x7F : 0x00); // FILES: tracks table
};
NumarkNS6.toggleDeckLayout = function() {
    return NumarkNS6.toggleSkinControl(NumarkNS6.skinKeys().decks);
};
// The layer switches are physical two-state controls.  Do not echo their
// incoming CC value through components.Button: doing so feeds the NS6's own
// switch state back into the controller and can leave its LED blinking or
// latched.  Drive each LED from the selected deck instead.
NumarkNS6.syncLayerLEDs = function() {
    if (engine.getValue("[NS6Surface]", "installed") === 1) {
        engine.setValue("[NS6Surface]", "left_alt", Number(NumarkNS6.leftDeck === 3));
        engine.setValue("[NS6Surface]", "right_alt", Number(NumarkNS6.rightDeck === 4));
    }
    midi.sendShortMsg(0xB0, 0x50, NumarkNS6.leftDeck === 3 ? 0x7F : 0x00);
    midi.sendShortMsg(0xB0, 0x51, NumarkNS6.rightDeck === 4 ? 0x7F : 0x00);
};

NumarkNS6.MixerTemplate = function() {

    // Original NS6 Split Cue switch: Note On/Off, channel 1, note 0.
    // Mirror its reported state; Note On enables Split Cue and Note Off disables it.
    this.splitCueSwitch = new components.Button({
        midi: [0x90, 0x00], group: "[Master]",
        outConnect: false,
        input: function(_ch, _ctrl, value, st) {
            engine.setValue("[Master]", "headSplit", +NumarkNS6.pressed(value, st));
        },
        shutdown: function() {}
    });

    // 🎧 Layer buttons (deck selection), tracked by the BPM meter.
    // RIGHT SIDE (Deck 2 / 4)
    this.deckChangeR = new components.Button({
        midi: [0xB0, 0x51],
        input: function(_c, _ctrl, value) {
            const next = value > 0 ? 4 : 2;
            if (NumarkNS6.rightDeck !== next) {
                NumarkNS6.releaseDeckGestures(NumarkNS6.Decks[NumarkNS6.rightDeck]);
                NumarkNS6.lastJogValue[next] = -1;
                NumarkNS6.Decks[next].bpmSlider.pickup = true;
            }
            NumarkNS6.rightDeck = next;
            NumarkNS6.syncLayerLEDs();
            NumarkNS6.refreshDeckLeds(NumarkNS6.rightDeck);

            if (typeof NumarkNS6.updateBpmMeter === "function") { NumarkNS6.updateBpmMeter(); }
        }
    });

    // LEFT SIDE (Deck 1 / 3)
    this.deckChangeL = new components.Button({
        midi: [0xB0, 0x50], // Verifique se o midino do L é 0x50
        input: function(_c, _ctrl, value) {
            const next = value > 0 ? 3 : 1;
            if (NumarkNS6.leftDeck !== next) {
                NumarkNS6.releaseDeckGestures(NumarkNS6.Decks[NumarkNS6.leftDeck]);
                NumarkNS6.lastJogValue[next] = -1;
                NumarkNS6.Decks[next].bpmSlider.pickup = true;
            }
            NumarkNS6.leftDeck = next;
            NumarkNS6.syncLayerLEDs();
            NumarkNS6.refreshDeckLeds(NumarkNS6.leftDeck);

            if (typeof NumarkNS6.updateBpmMeter === "function") { NumarkNS6.updateBpmMeter(); }
        }
    });

    this.channelInputSwitcher1 = new components.Button({
        input: function(ch, ctrl, val, st, g) { engine.setValue(g, "mute", +NumarkNS6.pressed(val, st)); }
    });
    this.channelInputSwitcher2 = new components.Button({
        input: function(ch, ctrl, val, st, g) { engine.setValue(g, "mute", +NumarkNS6.pressed(val, st)); }
    });
    this.channelInputSwitcher3 = new components.Button({
        input: function(ch, ctrl, val, st, g) { engine.setValue(g, "mute", +NumarkNS6.pressed(val, st)); }
    });
    this.channelInputSwitcher4 = new components.Button({
        input: function(ch, ctrl, val, st, g) { engine.setValue(g, "mute", +NumarkNS6.pressed(val, st)); }
    });

    this.changeCrossfaderContour = new components.Button({
        midi: [0x90, 0x4B], state: false,
        input: function(channel, control, value, status) {
            NumarkNS6.crossfaderCallbackConnections.forEach(function(cb) { cb.disconnect(); });
            NumarkNS6.crossfaderCallbackConnections = [];
            this.state=this.isPress(channel, control, value, status);
            const targetParams = this.state ? NumarkNS6.scratchXFader : NumarkNS6.storedCrossfaderParams;

            Object.keys(targetParams).forEach(function(ctrl) {
                const val = targetParams[ctrl];
                engine.setValue("[Mixer Profile]", ctrl, val);
                NumarkNS6.crossfaderCallbackConnections.push(engine.makeConnection("[Mixer Profile]", ctrl, NumarkNS6.CrossfaderChangeCallback.bind(this)));
            }.bind(this));
        }
    });

    this.navigationEncoderTick = new components.Encoder({midi: [0xB0, 0x44], group: "[Library]", input: function(ch, ctrl, val) { NumarkNS6.navigateLibrary(val < 64 ? 1 : -1); }});
    this.autoDjAddButton = new components.Button({midi: [0x90, 0x0D], group: "[AutoDJ]", input: function(ch, ctrl, val) { if (val === 0) { return; } NumarkNS6.pulse("[Library]", "AutoDjAddBottom"); }});

    // this.backButton = new components.Button({ midi: [0x90, 0x06], group: "[Library]", input: function (ch, ctrl, value) { if (value > 0) engine.setValue("[Library]", "MoveFocus", -1); } });
    // this.fwdButton = new components.Button({ midi: [0x90, 0x07], group: "[Library]", input: function (ch, ctrl, value) { if (value > 0) engine.setValue("[Library]", "MoveFocus", 1); } });

    // --- 🗺️ ADVANCED SKIN NAVIGATION (Engine DJ) ---

    // =======================================================
    // 🗺️ UNIVERSAL HYBRID NAVIGATION (CUSTOM + DEFAULT SKINS)
    // =======================================================
    // VIEW button (0x01) - Toggle between 2-deck and 4-deck layouts.
    this.viewButton = new components.Button({
        midi: [0x90, 0x01],
        input: function(ch, ctrl, val) {
            if (val > 0) {
                NumarkNS6.toggleDeckLayout();
            }
        }
    });

    // 3. FILES button (0x0A) - Open the Big Library without folders.
    this.filesButton = new components.Button({
        midi: [0x90, 0x0A],
        input: function(ch, ctrl, val) {
            if (val > 0) {
                if (NumarkNS6.sortIfShifted("BPM")) { return; }
                NumarkNS6.focusLibraryWidget(3);
            }
        }
    });

    // 4. CRATES button (0x0B) - Open the Big Library with folders.
    this.cratesButton = new components.Button({
        midi: [0x90, 0x0B],
        input: function(ch, ctrl, val) {
            if (val > 0) {
                if (NumarkNS6.sortIfShifted("TITLE")) { return; }
                NumarkNS6.focusLibraryWidget(2);
            }
        }
    });

    // 5. PREPARE button (0x09) - Toggle the Big Library.
    this.prepareButton = new components.Button({
        midi: [0x90, 0x09],
        input: function(ch, ctrl, val) {
            if (val > 0) {
                if (NumarkNS6.sortIfShifted("ARTIST")) { return; }
                NumarkNS6.toggleBigLibrary();
            }
        }
    });

    // =======================================================
    // 🚥 NAVIGATION LED ENGINE
    // =======================================================
    if (NumarkNS6.navTimer === 0) { NumarkNS6.navTimer = engine.beginTimer(250, NumarkNS6.updateNavLEDs); }





    // BACK button (left / move focus backward).
    this.backButton = new components.Button({
        midi: [0x90, 0x06], group: "[Library]",
        input: function(ch, ctrl, value) {
            if (value > 0) {
                // Check whether either controller SHIFT button is pressed.
                let isShifted = false;
                for (let i = 1; i <= 4; i++) {
                    if (NumarkNS6.Decks[i] && NumarkNS6.Decks[i].shiftButton && NumarkNS6.Decks[i].shiftButton.state) {
                        isShifted = true; break;
                    }
                }

                if (isShifted) {
                    NumarkNS6.moveLibraryFocus(-1, true);
                } else {
                    // Original behavior: move navigation focus backward.
                    NumarkNS6.moveLibraryFocus(-1, false);
                }
            }
        }
    });

    // FWD button (right / move focus forward).
    this.fwdButton = new components.Button({
        midi: [0x90, 0x07], group: "[Library]",
        input: function(ch, ctrl, value) {
            if (value > 0) {
                // Original behavior: move navigation focus forward.
                if (NumarkNS6.sortIfShifted("ALBUM")) { return; }
                NumarkNS6.moveLibraryFocus(1, false);
            }
        }
    });

    // Encoder button (push): open/close folders.
    this.navigationEncoderButton = new components.Button({
        midi: [0x90, 0x08], group: "[Library]",
        input: function(ch, ctrl, val, st) {
            if (!NumarkNS6.pressed(val, st)) { return; }

            // 1. Check whether SHIFT is pressed for the secondary function.
            let isShifted = false;
            for (let i = 1; i <= 4; i++) {
                if (NumarkNS6.Decks[i] && NumarkNS6.Decks[i].shiftButton && NumarkNS6.Decks[i].shiftButton.state) {
                    isShifted = true; break;
                }
            }

            if (isShifted) {
                // SHIFT + CLICK: Toggle AutoDJ.
                engine.setValue("[AutoDJ]", "enabled", !engine.getValue("[AutoDJ]", "enabled"));
                // Give immediate visual feedback with the button LED.
                midi.sendShortMsg(0xB0, 0x08, 0x7F);
                NumarkNS6.beginOneShot(100, function() { midi.sendShortMsg(0xB0, 0x08, 0x00); });
            } else {
                // 🎯 Toggle the selected folder in the sidebar tree.
                // This expands or collapses the selected item in the sidebar tree.
                NumarkNS6.focusLibraryWidget(NumarkNS6.navTarget);
                NumarkNS6.pulse("[Library]", "GoToItem");
            }
        }
    });

};
NumarkNS6.MixerTemplate.prototype = new components.ComponentContainer();

// =======================================================
// 🔥 HOTCUE MANAGEMENT
// =======================================================

NumarkNS6.HotcuesContainer = function(channel) {
    components.ComponentContainer.call(this); // Garante a herança para o Shift funcionar
    this.group = `[Channel${  channel  }]`;
    const theContainer = this;

    for (let i = 1; i <= 5; i++) {
        this[`hotCue${  i}`] = new components.Button({
            midi: [0x90 + channel, 0x12 + i, 0xB0 + channel, 0x0A + i],
            input: function(ch, ctrl, val, st, group) {
                const down = NumarkNS6.pressed(val, st);
                if (down) {
                    this.held = engine.getSetting("deleteHotcues") && NumarkNS6.Decks[channel].shiftButton.state
                        ? "hotcue_" + this.number + "_clear" : "hotcue_" + this.number + "_activate";
                }
                if (this.held) { engine.setValue(group, this.held, down ? 1 : 0); }
                if (!down) { this.held = null; }
            },
            number: i,
            group: theContainer.group,

            // 1. The native "push" component passes press (1) and release (0) to Mixxx.
            type: components.Button.prototype.types.push,

            // 2. Initial state: treat this as a play/preview trigger.
            inKey: `hotcue_${  i  }_activate`,

            // 3. Hold SHIFT to switch to clear and change the color to red.
            shift: function() {
                this.inKey = "hotcue_" + this.number + (engine.getSetting("deleteHotcues") ? "_clear" : "_activate");
                if (engine.getValue(this.group, `hotcue_${  this.number  }_position`) !== -1 && !NumarkNS6.isBooting) {
                    midi.sendShortMsg(this.midi[2], this.midi[3], engine.getSetting("deleteHotcues") ? 1 : 127);
                }
            },

            // 4. Release SHIFT to restore the normal function and white color.
            unshift: function() {
                this.inKey = `hotcue_${  this.number  }_activate`;
                if (engine.getValue(this.group, `hotcue_${  this.number  }_position`) !== -1 && !NumarkNS6.isBooting) {
                    midi.sendShortMsg(this.midi[2], this.midi[3], 0x7F);
                }
            }
        });

        // 5. Monitor whether the cue was created or deleted with the mouse/PC.
        (function(btn, grp, num) {
            engine.makeConnection(grp, `hotcue_${  num  }_position`, function(value) {
                if (NumarkNS6.isBooting) { return; } // Blinda a animação Vegas Mode

                if (value === -1) {
                    midi.sendShortMsg(btn.midi[2], btn.midi[3], 0x00); // Apagado
                } else {
                    // If the cue exists, check SHIFT to choose the LED color.
                    const deckNum = script.deckFromGroup(grp);
                    const isShifted = NumarkNS6.Decks[deckNum].shiftButton.state;
                    midi.sendShortMsg(btn.midi[2], btn.midi[3], isShifted && engine.getSetting("deleteHotcues") ? 0x01 : 0x7F);
                }
            });
        })(this[`hotCue${  i}`], theContainer.group, i);
    }
};
NumarkNS6.HotcuesContainer.prototype = new components.ComponentContainer();


// ==========================================================
// 🚀 SMART FADER START
// ==========================================================

NumarkNS6.faderStartLeft = false; NumarkNS6.faderStartRight = false; NumarkNS6.prevCrossfader = 0;
NumarkNS6.faderStartInput = function(ch, ctrl, v, st) {
    const side = ctrl === 2 ? "faderStartLeft" : "faderStartRight";
    NumarkNS6[side] = NumarkNS6.pressed(v, st);
};
NumarkNS6.setFaderStartPlayback = function(deckNum, playing) {
    const group = `[Channel${  deckNum  }]`;
    const deck = NumarkNS6.Decks[deckNum];
    if (playing) {
        if (deck) { deck.transportWantsPlay = true; }
        engine.setValue(group, "play", 1);
    } else {
        NumarkNS6.resetTransportIntentForCue(deck);
        engine.setValue(group, "cue_gotoandstop", 1);
        engine.setValue(group, "cue_gotoandstop", 0);
    }
};

engine.makeConnection("[Master]", "crossfader", function(value) {
    if (!NumarkNS6.isBooting && !NumarkNS6.reconnectBurst.isActive()) {
        [0, 2].forEach(function(side) {
            const left = side === 0;
            if (!(left ? NumarkNS6.faderStartLeft : NumarkNS6.faderStartRight)) { return; }
            const audible = left ? value < 0.95 : value > -0.95;
            const wasAudible = left ? NumarkNS6.prevCrossfader < 0.95 : NumarkNS6.prevCrossfader > -0.95;
            if (audible === wasAudible) { return; }
            for (let n = 1; n <= 4; ++n) {
                if (engine.getValue("[Channel" + n + "]", "orientation") === side) {
                    NumarkNS6.setFaderStartPlayback(n, audible);
                }
            }
        });
    }
    NumarkNS6.prevCrossfader = value;
});


// =======================================================
// 🎧 INDIVIDUAL DECK STRUCTURE
// =======================================================

NumarkNS6.Deck = function(channel) {
    components.Deck.call(this, channel);
    const groupName = `[Channel${  channel  }]`;
    this.deckNum = channel; this.midiChannel = channel; this.group = groupName; this.rateRangeEntry = 0;
    const theDeck = this;
    this.savedSlot = 0;
    this.hotcuesContainer = new NumarkNS6.HotcuesContainer(channel);
    this.gridSlipMode = false; this.gridAdjustMode = false; this.skipMode = false; this.scratchMode = true; this.isSearching = false;
    this.cuePressed = false;
    this.cuePressAction = null;
    this.cueGuardTimer = 0;
    this.cueIntentSyncTimer = 0;
    this.playPressed = false;
    this.lastPlayPressAt = 0;

    this.eqKnobs = [];
    for (let i = 1; i <= 3; i++) {
        this.eqKnobs[i] = NumarkNS6.filteredPot14Bit({
            midi: [0xB0, 0x29 + i + 5 * (channel - 1)], group: `[EqualizerRack1_${  theDeck.group  }_Effect1]`, inKey: `parameter${  i}`,
            inValueScale: function(v) { return (v > this.max * 0.46997 && v < this.max * 0.50659) ? (v + this.max * 0.015625) / this.max : v / this.max; }
        });
    }
    this.gainKnob = NumarkNS6.filteredPot14Bit({
        midi: [0xB0, 0x2C + 5 * (channel - 1)], group: groupName, inKey: "pregain",
        shift: function() {
            this.group = `[QuickEffectRack1_${  theDeck.group  }]`;
            this.inKey = "super1";
            if (this.firstValueReceived) {
                engine.softTakeover(this.group, this.inKey, true);
                engine.softTakeoverIgnoreNextValue(this.group, this.inKey);
            }
        },
        unshift: function() {
            this.group = theDeck.group;
            this.inKey = "pregain";
            if (this.firstValueReceived) {
                engine.softTakeover(this.group, this.inKey, true);
                engine.softTakeoverIgnoreNextValue(this.group, this.inKey);
            }
        }
    });


    this.playButton = new components.Button({
        midi: [0x90 + channel, 0x11, 0xB0 + channel, 0x09],
        group: groupName,
        output: function() {},
        input: function(ch, ctrl, val, st, grp) {
            print(`NS6 MIDI button PLAY deck=${  theDeck.deckNum  } edge=${  ((st & 0xF0) === 0x80 || val === 0) ? "up" : "down"  } raw=${  st  }/${  ctrl  }/${  val}`);
            // Treat Note Off by status, because some NS6 releases carry 0x7D
            // instead of zero as release velocity. Otherwise the press latch
            // stays set and every later press is incorrectly discarded.
            if ((st & 0xF0) === 0x80 || val === 0) {
                theDeck.playPressed = false;
                return;
            }
            if (val > 0) {
                if (!NumarkNS6.acceptPlayPress(theDeck, Date.now())) {
                    return;
                }
                // 🎯 If the platter just moved, cancel the timer and scratch now.
                // 🎯 If the platter just moved, cancel the timer and scratch now.
                // var deck = NumarkNS6.Decks[theDeck.deckNum];
                const deckNum = script.deckFromGroup(grp);
                const deck = NumarkNS6.Decks[deckNum];

                NumarkNS6.forceJogRelease(deckNum, deck, grp, "play press");

                if (deck.shiftButton.state) {
                    NumarkNS6.pulse(grp, "play_stutter");
                    deck.transportWantsPlay = true;
                } else { NumarkNS6.toggleDeckPlay(deckNum, grp); }
            }
        }
    });
    // Use Mixxx's native CUE control directly. A pending scratch handoff may
    // otherwise restore play shortly after CUE has stopped the deck, so CUE
    // always cancels that pending recovery before it reaches Mixxx.
    this.cueButton = new components.Button({
        midi: [0x90 + channel, 0x10, 0xB0 + channel, 0x08],
        group: groupName,
        output: function() {},
        input: function(ch, ctrl, val, st, grp) {
            const deck = NumarkNS6.Decks[theDeck.deckNum];
            const pressed = NumarkNS6.pressed(val, st);
            if (deck.shiftCue && !pressed) { deck.shiftCue = false; return; }
            if (pressed && deck.shiftButton.state) {
                deck.shiftCue = true;
                const elapsed = engine.getValue(grp, "duration") * engine.getValue(grp, "playposition");
                if (elapsed >= 2) { engine.setValue(grp, "playposition", 0); }
                else {
                    NumarkNS6.pulse("[Playlist]", "SelectPrevTrack");
                    NumarkNS6.pulse(grp, "LoadSelectedTrack");
                }
                return;
            }
            print(`NS6 MIDI button CUE deck=${  theDeck.deckNum  } edge=${  pressed ? "down" : "up"  } raw=${  st  }/${  ctrl  }/${  val}`);

            if (pressed) {
                // A second press without an intervening release is not a
                // valid NS6 button sequence. Repair the missing Note Off and
                // discard this edge; immediately re-pressing cue_default can
                // set a new cue during Mixxx's asynchronous return-to-cue seek.
                if (deck.cuePressed) {
                    print(`NS6 cue repaired missing release deck=${  theDeck.deckNum}`);
                    deck.releaseCue(grp, "repaired");
                    return;
                }
                deck.cuePressed = true;
                deck.cuePressAction = deck.cueGuardTimer !== 0 ? "return" : "default";
                // CUE returns/stops the deck. Clear the cached Play intent now
                // so the very next PLAY press starts instead of acting as pause.
                NumarkNS6.resetTransportIntentForCue(deck);
                if (deck.scrubTimer !== undefined && deck.scrubTimer !== 0) {
                    engine.stopTimer(deck.scrubTimer);
                    deck.scrubTimer = 0;
                }
                if (deck.scratchReleaseTimer !== undefined && deck.scratchReleaseTimer !== 0) {
                    engine.stopTimer(deck.scratchReleaseTimer);
                    deck.scratchReleaseTimer = 0;
                }
                if (deck.playbackGuardTimer !== undefined && deck.playbackGuardTimer !== 0) {
                    engine.stopTimer(deck.playbackGuardTimer);
                    deck.playbackGuardTimer = 0;
                }
                if (engine.isScratching(theDeck.deckNum)) {
                    engine.scratchDisable(theDeck.deckNum);
                }
                deck.isAutoScrubbing = false;
                deck.wasPlayingBeforeScratch = false;
                print(`NS6 cue press deck=${  theDeck.deckNum  } play=${  engine.getValue(grp, "play")}`);
                if (deck.cuePressAction === "return") {
                    // During the short seek-settling window, preview the
                    // saved cue while held. This avoids redefining it at a
                    // transient playhead position and preserves press/hold.
                    engine.setValue(grp, "cue_preview", 1);
                    return;
                }
                engine.setValue(grp, "cue_default", 1);
            } else {
                if (!deck.cuePressed) { return; }
                if (deck.cuePressAction === "return") {
                    engine.setValue(grp, "cue_preview", 0);
                    deck.cuePressed = false;
                    deck.cuePressAction = null;
                    NumarkNS6.syncTransportIntentAfterCue(deck, grp);
                    return;
                }
                engine.setValue(grp, "cue_default", 0);
                deck.releaseCue(grp, "raw");
            }
        }
    });

    // Some NS6 units intermittently report a CUE Note Off with the correct
    // channel status but the filler bytes 0x7D 0x7D instead of note 0x10,
    // velocity 0. The XML routes that signature here. Treat it as a release
    // only while this deck's CUE is genuinely held, so it cannot affect any
    // unrelated malformed MIDI report.
    this.releaseCue = function(grp, source) {
        if (!theDeck.cuePressed) { return; }
        theDeck.cuePressed = false;
        if (theDeck.cuePressAction === "default") {
            engine.setValue(grp, "cue_default", 0);
        } else if (theDeck.cuePressAction === "return") {
            engine.setValue(grp, "cue_preview", 0);
        }
        const shouldGuardRepeat = theDeck.cuePressAction === "default";
        theDeck.cuePressAction = null;
        if (shouldGuardRepeat) {
            if (theDeck.cueGuardTimer !== 0) { engine.stopTimer(theDeck.cueGuardTimer); }
            theDeck.cueGuardTimer = engine.beginTimer(180, function() {
                theDeck.cueGuardTimer = 0;
            }, true);
        }
        print(`NS6 cue ${  source  }-release deck=${  theDeck.deckNum  } play=${  engine.getValue(grp, "play")}`);
        NumarkNS6.syncTransportIntentAfterCue(theDeck, grp);
    };
    // One XML binding handles this shared malformed Note Off for PLAY, CUE,
    // and jog touch; each repair only acts when its own state is latched.
    this.transportMalformedRelease = function(ch, ctrl, val, st, grp) {
        NumarkNS6.repairMalformedTransportRelease(theDeck, grp, ctrl, val);
    };

    this.shiftButton = new components.Button({
        midi: [0x90 + channel, 0x12, 0xB0 + channel, 0x0A], state: false,
        input: function(ch, ctrl, v, st) {
            const down = NumarkNS6.pressed(v, st);
            if (down === this.state) { return; }
            this.state = down;
            if (down) { theDeck.shift(); } else { theDeck.unshift(); }
            this.send(down ? 127 : 0);
            NumarkNS6.updateSyncLED(channel, channel);
            NumarkNS6.FX.updateLEDs();
        }
    });
    this.syncButton = new components.Button({
        midi: [0x90 + channel, 0x0F], group: groupName,
        input: function(ch, ctrl, val, st, grp) {
            if (!NumarkNS6.pressed(val, st)) { return; }
            const deck = NumarkNS6.Decks[theDeck.deckNum];
            engine.setValue(grp, "sync_enabled", deck.shiftButton.state ? 0 : 1);
            if (deck.shiftButton.state) { deck.bpmSlider.offset = 0; deck.bpmSlider.pickup = true; }
            NumarkNS6.updateSyncLED(theDeck.deckNum, theDeck.midiChannel);
        }
    });

    this.gridSetClearInput = function(ch, ctrl, v, st, g) {
        if (NumarkNS6.pressed(v, st)) {
            NumarkNS6.pulse(g, theDeck.shiftButton.state ? "beats_undo_adjustment" : "beats_translate_curpos");
        }
    };
    this.gridSlipAdjustInput = function(ch, ctrl, v, st) {
        const down = NumarkNS6.pressed(v, st);
        theDeck.gridAdjustMode = down && !theDeck.shiftButton.state;
        theDeck.gridSlipMode = down && theDeck.shiftButton.state;
        theDeck.gridSlipAccumulator = theDeck.gridAdjustAccumulator = 0;
    };
    this.skipButtonInput = function(ch, ctrl, v, st) {
        theDeck.skipMode = NumarkNS6.pressed(v, st);
        theDeck.skipAccumulator = 0;
    };
    this.crossfaderAssignLeft = new components.Button({midi: [0x90, 0x33 + (this.deckNum * 2)], group: groupName, input: function(ch, ctrl, val, st, grp) { if (NumarkNS6.pressed(val, st)) { engine.setValue(grp, "orientation", 0); } else if (engine.getValue(grp, "orientation") === 0) { engine.setValue(grp, "orientation", 1); } }});
    this.crossfaderAssignRight = new components.Button({midi: [0x90, 0x34 + (this.deckNum * 2)], group: groupName, input: function(ch, ctrl, val, st, grp) { if (NumarkNS6.pressed(val, st)) { engine.setValue(grp, "orientation", 2); } else if (engine.getValue(grp, "orientation") === 2) { engine.setValue(grp, "orientation", 1); } }});

    this.pflButton = new components.Button({
        midi: [0x90, 0x30+channel], group: NumarkNS6.pflGroupForChannel(channel), key: "pfl",
        // PFL LEDs are controlled internally by the NS6 mixer. Do not emit
        // MIDI feedback on state changes or during controller shutdown.
        outConnect: false,
        shutdown: function() {},
        input: function(_c, _ctrl, val, status) {
            NumarkNS6.pflButtonInput(channel, val, status);
        }
    });

    const loadNote = (channel === 1 || channel === 3) ? 0x0C : 0x0E;
    this.loadButton = new components.Button({
        midi: [0x90 + channel, loadNote], group: groupName,
        input: function(ch, control, val, st, grp) {
            if (val === 0) { return; }
            const deck = NumarkNS6.Decks[script.deckFromGroup(grp)];
            if (deck && deck.shiftButton && deck.shiftButton.state) { engine.setValue(grp, "eject", 1); } else { engine.setValue(grp, "LoadSelectedTrack", 1); }
        }
    });

    this.manageChannelIndicator = () => {
        const isWarning = engine.getValue(theDeck.group, "end_of_track") > 0; // ⚡ Mixxx decide o tempo!

        if (isWarning) {
            this.alternating = !this.alternating;
            midi.sendShortMsg(0xB0, 0x1D + channel, this.alternating ? 0x7F : 0x0);
        } else {
            midi.sendShortMsg(0xB0, 0x1D + channel, 0x7F);
        }
    };
    engine.makeConnection(this.group, "track_loaded", function(val) {
        theDeck.savedSlot = 0;
        NumarkNS6.releaseLoopPad(theDeck);
        if (val === 0) {
            if (theDeck.blinkTimer !== 0) { engine.stopTimer(theDeck.blinkTimer); }
            theDeck.blinkTimer = 0;
            this.previouslyLoaded = 0;
            return;
        }
        NumarkNS6.syncTransportIntentAfterTrackLoad(theDeck, this.group);
        if (!this.previouslyLoaded) {
            theDeck.blinkTimer = engine.beginTimer(NumarkNS6.blinkInterval, function() {
                theDeck.blinkTimer = 0;
                theDeck.manageChannelIndicator();
            }, true);
        }
        this.previouslyLoaded=val;
    }.bind(this));

    this.pitchBendMinus = new components.Button({
        input: function(ch, ctrl, v, st, g) {
            const down = NumarkNS6.pressed(v, st);
            if (down) { this.held = "rate_temp_down" + (theDeck.shiftButton.state ? "_small" : ""); }
            if (this.held) { engine.setValue(g, this.held, down ? 1 : 0); }
            if (!down) { this.held = null; }
        }
    });
    this.pitchBendPlus = new components.Button({
        input: function(ch, ctrl, v, st, g) {
            const down = NumarkNS6.pressed(v, st);
            if (down) { this.held = "rate_temp_up" + (theDeck.shiftButton.state ? "_small" : ""); }
            if (this.held) { engine.setValue(g, this.held, down ? 1 : 0); }
            if (!down) { this.held = null; }
        }
    });
    this.keylockButton = new components.Button({midi: [0x90+channel, 0x1B, 0xB0+channel, 0x10], type: components.Button.prototype.types.toggle, shift: function() { this.inKey="sync_key"; this.outKey="sync_key"; }, unshift: function() { this.inKey="keylock"; this.outKey="keylock"; }});
    this.bpmSlider = new components.Pot({
        midi: [0xB0 + channel, 0x01, 0xB0 + channel, 0x21],
        inKey: "rate", group: theDeck.group, invert: true,
        pickup: true, offset: 0, lastFaderParameter: undefined,
        shift: function() { this.clutch = true; },
        unshift: function() {
            if (this.clutch && this.movedWithShift) {
                this.offset = engine.getParameter(this.group, "rate") - this.lastFaderParameter;
                this.pickup = false;
            }
            this.clutch = false;
            this.movedWithShift = false;
        },
        input: function(ch, ctrl, value) {
            const raw = this.MSB === undefined ? value : (this.MSB << 7) | value;
            const position = 1 - raw / 16383;
            const physicalSide = channel % 2;
            const previous = NumarkNS6.physicalPitch[physicalSide];
            NumarkNS6.physicalPitch[physicalSide] = position;
            this.lastFaderParameter = position;
            if (this.clutch) { this.movedWithShift = true; return; }
            const target = engine.getParameter(groupName, "rate");
            const next = Math.max(0, Math.min(1, position + this.offset));
            const last = previous === undefined ? next : previous + this.offset;
            if (this.pickup && Math.abs(next - target) > 0.004 && (last - target) * (next - target) > 0) {
                NumarkNS6.updateBpmMeter();
                return;
            }
            this.pickup = false;
            engine.setParameter(groupName, "rate", next);
            NumarkNS6.updateBpmMeter();
        }
    });

    NumarkNS6.protectPotStartupState(this.bpmSlider);

    this.pitchLedHandler = engine.makeConnection(this.group, "rate", function(val) {
        // A centred 14-bit fader does not always produce binary zero (the
        // midpoint is 8192/16383). Treat a tiny ±0.02% window as centre so
        // the pitch-lock LED reflects the physical detent reliably.
        if (!NumarkNS6.isBooting) {
            midi.sendShortMsg(0xB0 + channel, 0x37, Math.abs(val) <= 0.0002 ? 0x7F : 0x00);
        }
    });
    this.pitchRange = new components.Button({
        midi: [0x90 + channel, 0x1A, 0xB0 + channel, 0x1E], key: "rateRange",
        input: function(ch, cc, val, st) {
            if (!NumarkNS6.pressed(val, st)) { return; }
            theDeck.rateRangeEntry = (theDeck.rateRangeEntry + 1) % NumarkNS6.rateRanges.length;
            engine.setValue(this.group, "rateRange", NumarkNS6.rateRanges[theDeck.rateRangeEntry]);
            this.send(0x7F); NumarkNS6.beginOneShot(50, () => this.send(0x00));
        },
        // The NS6 has a single RANGE indicator LED. Light it for the
        // controller's standard ±8% range; the other ranges remain selectable.
        output: function(val) { this.send(Math.abs(val - 0.08) < 0.0001 ? 0x7F : 0x00); }
    });

    this.reconnectComponents(function(c) { if (c.group === undefined || c.group === "") { c.group = groupName; } });
    this.shutdown = function() {
        this.pitchLedHandler.disconnect();
        midi.sendShortMsg(0xB0+channel, 0x37, 0);
        midi.sendShortMsg(0xB0+channel, NumarkNS6.pitchTakeoverLED.UP, 0x00);
        midi.sendShortMsg(0xB0+channel, NumarkNS6.pitchTakeoverLED.DOWN, 0x00);
        this.pitchRange.send(0); this.keylockButton.send(0); this.syncButton.send(0);
        this.pitchBendPlus.send(0); this.pitchBendMinus.send(0); this.cueButton.send(0);
        this.playButton.send(0); this.shiftButton.send(0);
        if (theDeck.cueIntentSyncTimer !== 0) { engine.stopTimer(theDeck.cueIntentSyncTimer); }
        theDeck.cueIntentSyncTimer = 0;
        if (theDeck.blinkTimer !== 0) { engine.stopTimer(theDeck.blinkTimer); }
        theDeck.blinkTimer = 0;
        midi.sendShortMsg(0xB0, 0x1D+channel, 0);
    };
};

NumarkNS6.Deck.prototype = Object.create(components.Deck.prototype);
NumarkNS6.Deck.prototype.constructor = NumarkNS6.Deck;


// =======================================================
// 🎛️ JOG PROCESSING (HEAVY CDJ-STYLE ROTATION)
// =======================================================
// ===== SENSITIVITY SETTINGS - ORIGINAL NS6 =====
// =======================================================
// 🎛️ JOG PROCESSING (HEAVY CDJ-STYLE ROTATION)
// =======================================================

// CDJ mode: while playing, the platter pitch-bends; while stopped, it scrubs.
// The NS6 reports platter movement every ~5 ms, so nudge gain must stay low.
NumarkNS6.cdjScrubWeight = 4;
NumarkNS6.cdjNudgeDivisor = 30;
NumarkNS6.pitchBendSensitivity = 5;

NumarkNS6.jogMove14bit = function(ch, ctrl, val, st, grp) {
    // var deckNum = script.deckFromGroup(grp);
    // Replace `var deckNum = script.deckFromGroup(grp);` with:
    const deckNum = NumarkNS6.groupToDeck[grp];
    const deck = NumarkNS6.Decks[deckNum];
    const diag = NumarkNS6.jogMidiDiag[deckNum];
    if (diag && deck && deck.jogTouched) {
        const packetAt = Date.now();
        if (diag.lastPacketAt) { diag.maxInterPacketMs = Math.max(diag.maxInterPacketMs, packetAt - diag.lastPacketAt); }
        diag.lastPacketAt = packetAt;
        if (ctrl === 0x00) { diag.msbPackets++; } else if (ctrl === 0x20) { diag.lsbPackets++; }
    }

    if (ctrl === 0x00) { NumarkNS6.jogMSB[deckNum] = val; }
    if (ctrl === 0x20) { NumarkNS6.jogLSB[deckNum] = val; }
    const fullValue = (NumarkNS6.jogMSB[deckNum] << 7) | NumarkNS6.jogLSB[deckNum];
    if (ctrl !== 0x20) {
        if (deck && deck.jogTouched) { NumarkNS6.recordJogMidiTrace(diag, ctrl, val, fullValue, null); }
        return;
    }
    if (NumarkNS6.lastJogValue[deckNum] === -1) {
        NumarkNS6.lastJogValue[deckNum] = fullValue;
        if (diag && deck && deck.jogTouched) {
            diag.processedSamples++;
            NumarkNS6.recordJogMidiTrace(diag, ctrl, val, fullValue, null);
        }
        return;
    }

    let delta = fullValue - NumarkNS6.lastJogValue[deckNum];
    if (delta > 8192) { delta -= 16384; } else if (delta < -8192) { delta += 16384; }
    if (deck && deck.jogTouched) { NumarkNS6.recordJogMidiTrace(diag, ctrl, val, fullValue, delta); }
    if (diag && deck && deck.jogTouched && Math.abs(delta) >= NumarkNS6.jogTraceDeltaThreshold && !diag.pendingRawTrace) {
        diag.pendingRawTrace = diag.rawEventHistory.slice();
        diag.pendingRawTraceEvents = NumarkNS6.jogTraceFutureEvents;
    }
    // Reject an impossible jump, but rebase to that sample. Keeping the old position here can make every
    // later delta look impossible until the platter eventually catches up.
    if (Math.abs(delta) > NumarkNS6.maxJogDelta) {
        if (diag && deck && deck.jogTouched) { diag.rejectedSamples++; }
        NumarkNS6.lastJogValue[deckNum] = fullValue;
        return;
    }
    NumarkNS6.lastJogValue[deckNum] = fullValue;
    if (diag && deck && deck.jogTouched) {
        diag.processedSamples++;
        diag.maxAbsDelta = Math.max(diag.maxAbsDelta, Math.abs(delta));
        if (delta === 0) { diag.zeroSamples++; } else {
            if (diag.movingSamples === 0) {
                diag.minDelta = delta;
                diag.maxDelta = delta;
            } else {
                diag.minDelta = Math.min(diag.minDelta, delta);
                diag.maxDelta = Math.max(diag.maxDelta, delta);
            }
        }
        if (delta !== 0) {
            diag.movingSamples++;
            if (delta > 0) { diag.forwardSamples++; diag.forwardDelta += delta; } else { diag.backwardSamples++; diag.backwardDelta += -delta; }
        }
    }
    if (!deck) { return; }

    if (deck.editBoundary && delta !== 0) {
        const start = engine.getValue(grp, "loop_start_position");
        const end = engine.getValue(grp, "loop_end_position");
        const limit = engine.getValue(grp, "track_samples");
        if (start >= 0 && end > start && limit >= end) {
            const offset = delta * 32;
            const position = deck.editBoundary === "loop_start_position"
                ? Math.max(0, Math.min(end - 2, start + offset))
                : Math.min(limit, Math.max(start + 2, end + offset));
            engine.setValue(grp, deck.editBoundary, position);
        }
        return;
    }
    // 1. SKIP MODE (protected beatjump via platter).
    if ((deck.skipMode || (deck.shiftButton && deck.shiftButton.state)) && !deck.gridSlipMode && !deck.gridAdjustMode) {
        if (deck.skipAccumulator === undefined) { deck.skipAccumulator = 0; }
        deck.skipAccumulator += delta;
        if (deck.skipAccumulator > 30) { NumarkNS6.pulse(grp, "beatjump_1_forward"); deck.skipAccumulator = 0; } else if (deck.skipAccumulator < -30) { NumarkNS6.pulse(grp, "beatjump_1_backward"); deck.skipAccumulator = 0; }
        return;
    }

    // 2. SLIP MODE (beatgrid adjustment).
    if (deck.gridSlipMode) {
        if (deck.gridSlipAccumulator === undefined) { deck.gridSlipAccumulator = 0; }
        deck.gridSlipAccumulator += delta;
        const slipThreshold = 25;
        if (deck.gridSlipAccumulator > slipThreshold) {
            engine.setValue(grp, "beats_translate_later", 1);
            engine.setValue(grp, "beats_translate_later", 0);
            deck.gridSlipAccumulator = 0;
        } else if (deck.gridSlipAccumulator < -slipThreshold) {
            engine.setValue(grp, "beats_translate_earlier", 1);
            engine.setValue(grp, "beats_translate_earlier", 0);
            deck.gridSlipAccumulator = 0;
        }
        return;
    }

    // 3. ADJUST MODE (stretch the beatgrid).
    if (deck.gridAdjustMode) {
        if (deck.gridAdjustAccumulator === undefined) { deck.gridAdjustAccumulator = 0; }
        deck.gridAdjustAccumulator += delta;
        const adjustThreshold = 30;
        if (deck.gridAdjustAccumulator > adjustThreshold) {
            engine.setValue(grp, "beats_adjust_slower", 1);
            engine.setValue(grp, "beats_adjust_slower", 0);
            deck.gridAdjustAccumulator = 0;
        } else if (deck.gridAdjustAccumulator < -adjustThreshold) {
            engine.setValue(grp, "beats_adjust_faster", 1);
            engine.setValue(grp, "beats_adjust_faster", 0);
            deck.gridAdjustAccumulator = 0;
        }
        return;
    }


    if (deck.jogTouched && delta !== 0) {
        NumarkNS6.recordJogRate(deck, engine.getValue(grp, "scratch2"), Date.now());
    }

    // Continue following the platter's real inertia after touch release.
    // Hand off only after the encoder has been quiet for the release interval.
    if (!deck.jogTouched && deck.scratchReleasePending) {
        if (deck.spinCandidateDirection && delta * deck.spinCandidateDirection > 0) {
            const now = Date.now();
            if (!deck.spinConfirmed) {
                if (!deck.spinTailStartedAt) { deck.spinTailStartedAt = now; }
                deck.spinTailDelta += Math.abs(delta);
                if (now - deck.spinTailStartedAt >= NumarkNS6.spinMinCoastMs &&
                        deck.spinTailDelta >= NumarkNS6.spinMinCoastDelta) {
                    deck.spinConfirmed = true;
                    print(`NS6 platter spin confirmed deck=${  deckNum  } direction=${
                        deck.spinCandidateDirection  } tailMs=${  now - deck.spinTailStartedAt
                    } tailDelta=${  deck.spinTailDelta}`);
                    if (deck.spinCandidateDirection > 0 && deck.wasPlayingBeforeScratch && !deck.spinRampStarted) {
                        engine.scratchDisable(deckNum, true);
                        deck.spinRampStarted = true;
                    }
                }
            }
        } else if (deck.spinCandidateDirection && delta !== 0 && !deck.spinConfirmed) {
            deck.spinCandidateDirection = 0;
            deck.spinTailStartedAt = 0;
            deck.spinTailDelta = 0;
            print(`NS6 platter spin candidate canceled by opposite tail deck=${  deckNum}`);
        }
        if (engine.isScratching(deckNum) && !deck.isAutoScrubbing) {
            engine.scratchTick(deckNum, NumarkNS6.scratchDeltaForDjaySensitivity(delta));
            if (diag && delta !== 0) {
                diag.scratchTickCalls++;
                diag.scratchTickAbsSum += Math.abs(delta);
            }
        }
        // Only a confirmed spin may ramp to deck rate; reverse spins first
        // coast close to zero so the forward target does not brake them.
        if (deck.spinConfirmed && deck.spinCandidateDirection < 0 && !deck.spinRampStarted &&
                engine.getValue(grp, "scratch2") >= -NumarkNS6.backspinRampStartRate) {
            engine.scratchDisable(deckNum, true);
            deck.spinRampStarted = true;
        }
        NumarkNS6.scheduleScratchHandoff(deckNum, deck, grp);
        return;
    }

    // Discard late packets after the completed handoff instead of turning
    // them into an unintended nudge.
    if (!deck.jogTouched && deck.ignoreJogTail) { return; }

    // --------------------------------------------------------
    // 4. SEPARATE SCRATCH FROM NUDGE
    // --------------------------------------------------------

    // If the touch sensor (jogTouch14bit) enabled the motor...
    if (engine.isScratching(deckNum) && !deck.isAutoScrubbing) {
        // ...drag the track (scratch mode).
        engine.scratchTick(deckNum, NumarkNS6.scratchDeltaForDjaySensitivity(delta));
        if (diag && deck.jogTouched && delta !== 0) {
            diag.scratchTickCalls++;
            diag.scratchTickAbsSum += Math.abs(delta);
        }
    } else {
        // If the platter is not touched (or scratch mode is disabled)...
        if (engine.getValue(grp, "play") > 0) {
            // CDJ nudge: gentle for slow movements, stronger as rotation speeds up.
            engine.setValue(grp, "jog", delta / NumarkNS6.cdjNudgeDivisor);
        } else {
            // PAUSED TRACK: scrub with the CDJ "Timer Sniper" engine.
            if (!deck.isAutoScrubbing) {
                const heavyResolution = NumarkNS6.scratchSettings.jogResolution * NumarkNS6.cdjScrubWeight;
                engine.scratchEnable(deckNum, heavyResolution, 33.33, NumarkNS6.scratchSettings.alpha, NumarkNS6.scratchSettings.beta);
                deck.isAutoScrubbing = true;
            }
            engine.scratchTick(deckNum, NumarkNS6.scratchDeltaForDjaySensitivity(delta));

            // This timer clears the audio when platter movement stops.
            if (deck.scrubTimer !== undefined && deck.scrubTimer !== 0) { engine.stopTimer(deck.scrubTimer); }
            deck.scrubTimer = engine.beginTimer(100, function() {
                engine.scratchDisable(deckNum);
                deck.isAutoScrubbing = false;
                deck.scrubTimer = 0;
            }, true);
        }
    }
};

NumarkNS6.scratchButtonInput = function(ch, ctrl, val, st, grp) {
    if (val === 0) { return; }

    const deckNum = script.deckFromGroup(grp);
    const deck = NumarkNS6.Decks[deckNum];
    if (!deck) { return; }

    if ((st & 0xF0) === 0x80) { return; }
    if (deck.shiftButton.state) {
        engine.setValue(grp, "slip_enabled", +!engine.getValue(grp, "slip_enabled"));
        return;
    }
    // Toggle the mode in Mixxx's state.
    deck.scratchMode = !deck.scratchMode;

    // 🎯 Restore the LED to the correct address (0x12).
    midi.sendShortMsg(0xB0 + deck.midiChannel, 0x12, deck.scratchMode ? 0x7F : 0x00);
};

NumarkNS6.scheduleScratchHandoff = function(deckNum, deck, grp) {
    if (deck.scratchReleaseTimer !== undefined && deck.scratchReleaseTimer !== 0) {
        engine.stopTimer(deck.scratchReleaseTimer);
    }
    if (!deck.scratchReleasePending) { return; }
    const resumePlayback = (typeof deck.transportWantsPlay === "boolean")
        ? deck.transportWantsPlay : (deck.scratchResumeIntent || deck.wasPlayingBeforeScratch);
    const quietDelay = deck.spinCandidateDirection
        ? NumarkNS6.spinCandidateQuietMs : NumarkNS6.scratchReleaseDelayMs;
    deck.scratchReleaseTimer = engine.beginTimer(quietDelay, function() {
        deck.scratchReleaseTimer = 0;
        if (deck.jogTouched) { return; }
        if (deck.spinCandidateDirection && !deck.spinConfirmed) {
            deck.scratchReleasePending = false;
            if (!deck.spinRampStarted) { engine.scratchDisable(deckNum, false); }
            deck.spinRampStarted = false;
            deck.spinCandidateDirection = 0;
            deck.spinConfirmed = false;
            deck.wasPlayingBeforeScratch = false;
            deck.ignoreJogTail = true;
            print(`NS6 short platter release; returning to playback deck=${  deckNum
            } tailMs=${  deck.spinTailStartedAt ? Date.now() - deck.spinTailStartedAt : 0
            } tailDelta=${  deck.spinTailDelta || 0}`);
            deck.scratchReleaseTimer = engine.beginTimer(NumarkNS6.scratchReleaseDelayMs, function() {
                deck.scratchReleaseTimer = 0;
                deck.ignoreJogTail = false;
            }, true);
            NumarkNS6.scheduleScratchPlaybackRecovery(deckNum, deck, grp, resumePlayback);
            return;
        }
        deck.scratchReleasePending = false;
        if (!deck.spinRampStarted) {
            engine.scratchDisable(deckNum, deck.spinConfirmed && deck.wasPlayingBeforeScratch);
        }
        deck.spinRampStarted = false;
        deck.spinCandidateDirection = 0;
        deck.spinConfirmed = false;
        deck.ignoreJogTail = false;
        print(`NS6 handoff complete deck=${  deckNum  } play=${  engine.getValue(grp, "play")  } scratch=${  engine.isScratching(deckNum)  } rate=${  engine.getValue(grp, "scratch2")}`);
        // The spin ramp has started; let Mixxx finish it toward deck rate.
        deck.wasPlayingBeforeScratch = false;
        deck.ignoreJogTail = true;
        deck.scratchReleaseTimer = engine.beginTimer(NumarkNS6.scratchReleaseDelayMs, function() {
            deck.scratchReleaseTimer = 0;
            deck.ignoreJogTail = false;
        }, true);
        // Scratch never sends a Play/Pause command. Let scratchDisable return
        // playback ownership directly to Mixxx; manufacturing a Play press
        // here can restart/drag the track after an otherwise normal scratch.
        NumarkNS6.scheduleScratchPlaybackRecovery(deckNum, deck, grp, resumePlayback);
    }, true);
};

// Recover only if Mixxx dropped its Play control during a scratch handoff.
// This never toggles a deck that was paused before the jog was touched.
NumarkNS6.scheduleScratchPlaybackRecovery = function(deckNum, deck, grp, resumePlayback) {
    if (!resumePlayback) { return; }
    if (deck.playbackGuardTimer !== undefined && deck.playbackGuardTimer !== 0) {
        engine.stopTimer(deck.playbackGuardTimer);
    }
    deck.playbackGuardTimer = engine.beginTimer(NumarkNS6.scratchPlaybackRecoveryMs, function() {
        deck.playbackGuardTimer = 0;
        if (deck.jogTouched) { return; }
        if (deck.transportWantsPlay === false) { return; }
        if (engine.getValue(grp, "play") === 0) {
            print(`NS6: restoring lost Play state after scratch handoff on deck ${  deckNum}`);
            engine.setValue(grp, "play", 1);
        }
        deck.scratchResumeIntent = false;
    }, true);
};

// End an ordinary scratch immediately; spin releases start Mixxx's native
// ramp at touch-off so the moving platter can decelerate into normal playback.
NumarkNS6.releaseScratchToPlayback = function(deckNum, deck, grp) {
    // The touch-start state is authoritative. The current control value can
    // reflect an internal scratch transition, not an intention to start a
    // track that was paused.
    const resume = (typeof deck.transportWantsPlay === "boolean")
        ? deck.transportWantsPlay
        : ((deck.scratchResumeIntent || deck.wasPlayingBeforeScratch) || engine.getValue(grp, "play") > 0);
    engine.scratchDisable(deckNum, false);
    return resume;
};

NumarkNS6.forceJogRelease = function(deckNum, deck, grp, reason) {
    ["scrubTimer", "scratchReleaseTimer", "playbackGuardTimer"].forEach(function(timerName) {
        if (deck[timerName] !== undefined && deck[timerName] !== 0) { engine.stopTimer(deck[timerName]); }
        deck[timerName] = 0;
    });
    if (deck.jogTouched || deck.scratchReleasePending || deck.isAutoScrubbing || engine.isScratching(deckNum)) {
        print(`NS6 scratch resync deck=${  deckNum  } reason=${  reason}`);
        NumarkNS6.releaseScratchToPlayback(deckNum, deck, grp);
    }
    deck.jogTouched = false;
    deck.scratchReleasePending = false;
    deck.wasPlayingBeforeScratch = false;
    deck.scratchResumeIntent = false;
    deck.spinCandidateDirection = 0;
    deck.spinConfirmed = false;
    deck.spinRampStarted = false;
    deck.spinTailStartedAt = 0;
    deck.spinTailDelta = 0;
    deck.isAutoScrubbing = false;
    deck.ignoreJogTail = true;
    deck.scratchReleaseTimer = engine.beginTimer(NumarkNS6.scratchReleaseDelayMs, function() {
        deck.scratchReleaseTimer = 0;
        deck.ignoreJogTail = false;
    }, true);
};

NumarkNS6.jogTouch14bit = function(ch, ctrl, val, st, grp) {
    const deckNum = NumarkNS6.groupToDeck[grp];
    const deck = NumarkNS6.Decks[deckNum];
    if (!deck) { return; }

    // Touch takes control of the motor; the scrub timer must not stop it.
    if (deck.scrubTimer !== undefined && deck.scrubTimer !== 0) {
        engine.stopTimer(deck.scrubTimer);
        deck.scrubTimer = 0;
    }
    deck.isAutoScrubbing = false;

    if (NumarkNS6.pressed(val, st) && (deck.editBoundary || deck.skipMode || deck.gridAdjustMode ||
            deck.gridSlipMode || (deck.shiftButton && deck.shiftButton.state))) { return; }
    if (NumarkNS6.pressed(val, st) && deck.scratchMode) {
        // Touch is a state, not a retrigger. A repeated Note On while already
        // touched must not disable scratch and briefly hand playback back.
        if (deck.jogTouched) {
            print(`NS6 repeated jog touch deck=${  deckNum  } value=${  val  } keeping scratch active`);
            return;
        }
        const playbackGuardPending = deck.playbackGuardTimer !== undefined && deck.playbackGuardTimer !== 0;
        const preserveResumeIntent = engine.getValue(grp, "play") > 0 ||
            (playbackGuardPending && deck.scratchResumeIntent === true && deck.transportWantsPlay === true);
        if (deck.scratchReleaseTimer !== undefined && deck.scratchReleaseTimer !== 0) {
            engine.stopTimer(deck.scratchReleaseTimer);
            deck.scratchReleaseTimer = 0;
        }
        if (deck.playbackGuardTimer !== undefined && deck.playbackGuardTimer !== 0) {
            engine.stopTimer(deck.playbackGuardTimer);
            deck.playbackGuardTimer = 0;
        }
        deck.jogTouched = true;
        NumarkNS6.jogMidiDiag[deckNum] = {
            deckNum: deckNum, startedAt: Date.now(), msbPackets: 0, lsbPackets: 0,
            processedSamples: 0, movingSamples: 0, zeroSamples: 0, rejectedSamples: 0,
            maxAbsDelta: 0, minDelta: 0, maxDelta: 0,
            scratchTickCalls: 0, scratchTickAbsSum: 0,
            forwardSamples: 0, backwardSamples: 0, forwardDelta: 0, backwardDelta: 0,
            maxInterPacketMs: 0, lastPacketAt: 0,
            rawEventHistory: [], pendingRawTrace: null, pendingRawTraceEvents: 0
        };
        deck.spinCandidateDirection = 0;
        deck.spinConfirmed = false;
        deck.spinRampStarted = false;
        deck.spinTailStartedAt = 0;
        deck.spinTailDelta = 0;
        deck.scratchReleasePending = false;
        deck.wasPlayingBeforeScratch = preserveResumeIntent;
        deck.scratchResumeIntent = preserveResumeIntent;
        deck.transportWantsPlay = preserveResumeIntent;
        deck.jogRateSamples = [];
        NumarkNS6.recordJogRate(deck, engine.getValue(grp, "scratch2"), Date.now());
        deck.ignoreJogTail = false;
        print(`NS6 handoff touch deck=${  deckNum  } play=${  deck.wasPlayingBeforeScratch ? 1 : 0}`);
        engine.scratchEnable(deckNum, NumarkNS6.scratchSettings.jogResolution, 33.33, NumarkNS6.scratchSettings.alpha, NumarkNS6.scratchSettings.beta);
    } else {
        // The NS6 occasionally sends an extra Note Off without a matching
        // Note On. Never let this stray event stop scratch or change deck
        // playback state.
        if (!deck.jogTouched) {
            return;
        }
        const jogDiag = NumarkNS6.jogMidiDiag[deckNum];
        if (jogDiag) {
            NumarkNS6.flushJogMidiTrace(jogDiag);
            print(`NS6 MIDI jog capture deck=${  deckNum
            } durationMs=${  Date.now() - jogDiag.startedAt
            } packetsMSB=${  jogDiag.msbPackets  } packetsLSB=${  jogDiag.lsbPackets
            } processed=${  jogDiag.processedSamples  } moving=${  jogDiag.movingSamples
            } zero=${  jogDiag.zeroSamples  } maxAbsDelta=${  jogDiag.maxAbsDelta
            } minDelta=${  jogDiag.minDelta  } maxDelta=${  jogDiag.maxDelta
            } scratchTicks=${  jogDiag.scratchTickCalls  } tickAbsSum=${  jogDiag.scratchTickAbsSum
            } forward=${  jogDiag.forwardSamples  }/${  jogDiag.forwardDelta
            } backward=${  jogDiag.backwardSamples  }/${  jogDiag.backwardDelta
            } rejected=${  jogDiag.rejectedSamples  } maxGapMs=${  jogDiag.maxInterPacketMs}`);
            NumarkNS6.jogMidiDiag[deckNum] = null;
        }
        deck.jogTouched = false;
        const releaseRate = engine.getValue(grp, "scratch2");
        NumarkNS6.recordJogRate(deck, releaseRate, Date.now());
        const releaseAcceleration = NumarkNS6.getJogAcceleration(deck);
        print(`NS6 handoff release deck=${  deckNum  } play=${  engine.getValue(grp, "play")  } scratch=${  engine.isScratching(deckNum)  } rate=${  releaseRate  } accel=${  releaseAcceleration}`);
        if (Math.abs(releaseRate) >= NumarkNS6.spinReleaseRateThreshold) {
            // Keep scratch active in either direction until the platter's
            // remaining movement is consumed.
            deck.scratchReleasePending = true;
            deck.spinCandidateDirection = releaseRate < 0 ? -1 : 1;
            deck.spinConfirmed = false;
            deck.spinRampStarted = false;
            deck.spinTailStartedAt = 0;
            deck.spinTailDelta = 0;
            deck.ignoreJogTail = false;
            NumarkNS6.scheduleScratchHandoff(deckNum, deck, grp);
        } else {
            // Normal scratch release must not simulate another Play press or
            // wait for platter coasting; just hand playback back to Mixxx.
            const resumePlayback = (typeof deck.transportWantsPlay === "boolean")
                ? deck.transportWantsPlay : (deck.scratchResumeIntent || deck.wasPlayingBeforeScratch);
            deck.scratchReleasePending = false;
            deck.spinCandidateDirection = 0;
            deck.spinConfirmed = false;
            deck.spinRampStarted = false;
            NumarkNS6.releaseScratchToPlayback(deckNum, deck, grp);
            deck.wasPlayingBeforeScratch = false;
            deck.ignoreJogTail = true;
            deck.scratchReleaseTimer = engine.beginTimer(NumarkNS6.scratchReleaseDelayMs, function() {
                deck.scratchReleaseTimer = 0;
                deck.ignoreJogTail = false;
            }, true);
            NumarkNS6.scheduleScratchPlaybackRecovery(deckNum, deck, grp, resumePlayback);
        }
    }
};

// The Serato QSG labels these four pads in bars (4/4); Mixxx takes beats.
NumarkNS6.autoSizes = [4, 8, 16, 32];
NumarkNS6.rollSizes = [0.0625, 0.125, 0.25, 0.5];
NumarkNS6.pressed = function(value, status) {
    return (status & 0xF0) !== 0x80 && value > 0;
};
NumarkNS6.pulse = function(group, key) {
    engine.setValue(group, key, 1);
    engine.setValue(group, key, 0);
};
NumarkNS6.reverseButtonInput = function(ch, ctrl, val, st, group) {
    const deck = NumarkNS6.Decks[ch];
    if (!NumarkNS6.pressed(val, st)) {
        if (deck.bleep) { engine.setValue(group, "reverseroll", 0); }
        deck.bleep = false;
    } else if (deck.shiftButton.state) {
        deck.bleep = true;
        engine.setValue(group, "reverseroll", 1);
    } else {
        engine.setValue(group, "reverse", +!engine.getValue(group, "reverse"));
    }
    NumarkNS6.updateReverseLED(ch);
};
NumarkNS6.loopHalveInput = function(ch, ctrl, val, st, group) {
    if (NumarkNS6.pressed(val, st)) { NumarkNS6.pulse(group, "loop_halve"); }
};
NumarkNS6.loopDoubleInput = function(ch, ctrl, val, st, group) {
    if (NumarkNS6.pressed(val, st)) { NumarkNS6.pulse(group, "loop_double"); }
};
NumarkNS6.loopShift = function(ch, ctrl, val, st, g) {
    if (!NumarkNS6.pressed(val, st)) { return; }
    const a = engine.getValue(g, "loop_start_position");
    const b = engine.getValue(g, "loop_end_position");
    if (a < 0 || b <= a) { return; }
    const length = b - a;
    const delta = ctrl === 0x25 ? -length : length;
    if (a + delta < 0 || b + delta > engine.getValue(g, "track_samples")) { return; }
    const beatSize = engine.getValue(g, "beatloop_size");
    if (beatSize > 0 && engine.getValue(g, "beatloop_" + beatSize + "_enabled")) {
        engine.setValue(g, "loop_move", (delta > 0 ? 1 : -1) * engine.getValue(g, "beatloop_size"));
        return;
    }
    const samples = engine.getValue(g, "track_samples");
    const cursor = engine.getValue(g, "playposition") * samples;
    // Move the farther boundary first so even adjacent endpoints stay valid.
    const first = delta > 0 ? "loop_end_position" : "loop_start_position";
    const last = delta > 0 ? "loop_start_position" : "loop_end_position";
    engine.setValue(g, first, (delta > 0 ? b : a) + delta);
    engine.setValue(g, last, (delta > 0 ? a : b) + delta);
    if (engine.getValue(g, "loop_enabled") && cursor >= a && cursor < b) {
        engine.setValue(g, "playposition", (cursor + delta) / samples);
    }
};
NumarkNS6.releaseLoopPad = function(deck) {
    if (deck.rollKey) { engine.setValue(deck.group, deck.rollKey, 0); }
    deck.rollKey = null;
    deck.heldPad = null;
    deck.editBoundary = null;
};
NumarkNS6.loopModeInput = function(ch, ctrl, val, st) {
    if (!NumarkNS6.pressed(val, st)) { return; }
    NumarkNS6.releaseLoopPad(NumarkNS6.Decks[ch]);
    NumarkNS6.deckLoopMode[ch] = !NumarkNS6.deckLoopMode[ch];
    NumarkNS6.updateAutoLoopLEDs(ch);
};
NumarkNS6.hasSavedLoop = function(g, slot) {
    return slot > 0 && engine.getValue(g, "hotcue_" + slot + "_type") === 4;
};
NumarkNS6.loopOnOffInput = function(ch, ctrl, val, st, g) {
    if (!NumarkNS6.pressed(val, st) || !engine.getValue(g, "track_loaded")) { return; }
    const deck = NumarkNS6.Decks[ch];
    if (deck.shiftButton.state && !NumarkNS6.deckLoopMode[ch]) {
        if (!engine.getValue(g, "loop_enabled")) { return; }
        for (let slot = 6; slot <= 37; ++slot) {
            if (engine.getValue(g, "hotcue_" + slot + "_status") === 0) {
                NumarkNS6.pulse(g, "hotcue_" + slot + "_setloop");
                deck.savedSlot = slot;
                break;
            }
        }
    } else if (engine.getValue(g, "loop_end_position") >= 0) {
        NumarkNS6.pulse(g, "reloop_toggle");
    } else if (NumarkNS6.deckLoopMode[ch]) {
        NumarkNS6.pulse(g, "beatloop_activate");
    }
    NumarkNS6.updateAutoLoopLEDs(ch);
};
NumarkNS6.loopButtonInput = function(ch, ctrl, val, st, g) {
    const deck = NumarkNS6.Decks[ch];
    const pad = ctrl - 0x28;
    if (!NumarkNS6.pressed(val, st)) {
        if (deck.heldPad === pad) { NumarkNS6.releaseLoopPad(deck); }
        return;
    }
    if (!engine.getValue(g, "track_loaded") || deck.heldPad === pad) { return; }
    NumarkNS6.releaseLoopPad(deck);
    deck.heldPad = pad;
    if (deck.shiftButton.state) {
        if (pad === 2 && !NumarkNS6.deckLoopMode[ch]) {
            if (NumarkNS6.hasSavedLoop(g, deck.savedSlot)) {
                NumarkNS6.pulse(g, "hotcue_" + deck.savedSlot + "_clear");
                deck.savedSlot = 0;
            }
        } else {
            deck.rollKey = "beatlooproll_" + NumarkNS6.rollSizes[pad] + "_activate";
            engine.setValue(g, deck.rollKey, 1);
        }
    } else if (NumarkNS6.deckLoopMode[ch]) {
        NumarkNS6.pulse(g, "beatloop_" + NumarkNS6.autoSizes[pad] + "_toggle");
    } else if (pad < 2) {
        if (engine.getValue(g, "loop_enabled")) {
            deck.editBoundary = pad === 0 ? "loop_start_position" : "loop_end_position";
        } else {
            deck.savedSlot = 0;
            NumarkNS6.pulse(g, pad === 0 ? "loop_in" : "loop_out");
        }
    } else if (pad === 2) {
        for (let offset = 1; offset <= 37; ++offset) {
            const slot = ((deck.savedSlot || 0) + offset - 1) % 37 + 1;
            if (NumarkNS6.hasSavedLoop(g, slot)) {
                deck.savedSlot = slot;
                break;
            }
        }
    } else if (NumarkNS6.hasSavedLoop(g, deck.savedSlot)) {
        NumarkNS6.pulse(g, "hotcue_" + deck.savedSlot + "_gotoandloop");
    } else if (engine.getValue(g, "loop_end_position") >= 0) {
        engine.setValue(g, "loop_enabled", 1);
        NumarkNS6.pulse(g, "loop_in_goto");
    }
    NumarkNS6.updateAutoLoopLEDs(ch);
};
NumarkNS6.updateAutoLoopLEDs = function(ch) {
    if (NumarkNS6.isBooting) { return; }
    const deck = NumarkNS6.Decks[ch], g = deck.group;
    const auto = NumarkNS6.deckLoopMode[ch];
    NumarkNS6.sendLed(0xB0 + ch, 0x18, auto ? 1 : 2);
    const manual = [engine.getValue(g, "loop_start_position") >= 0,
        engine.getValue(g, "loop_end_position") >= 0,
        NumarkNS6.hasSavedLoop(g, deck.savedSlot), engine.getValue(g, "loop_enabled")];
    NumarkNS6.autoSizes.forEach(function(size, pad) {
        const on = auto ? engine.getValue(g, "beatloop_" + size + "_enabled") : manual[pad];
        NumarkNS6.sendLed(0xB0 + ch, 0x19 + pad, on ? (auto ? 1 : 2) : 0);
    });
};

NumarkNS6.releaseDeckGestures = function(deck) {
    NumarkNS6.releaseLoopPad(deck);
    if (deck.bleep) { engine.setValue(deck.group, "reverseroll", 0); deck.bleep = false; }
    if (deck.shiftButton.state) { deck.shiftButton.input(0, 0, 0, 0x80); }
    deck.skipMode = deck.gridSlipMode = deck.gridAdjustMode = false;
    [deck.pitchBendPlus, deck.pitchBendMinus].forEach(function(button) {
        if (button.held) { engine.setValue(deck.group, button.held, 0); button.held = null; }
    });
    if (deck.jogTouched) { NumarkNS6.forceJogRelease(deck.deckNum, deck, deck.group, "layer"); }
    if (deck.cuePressed) { deck.releaseCue(deck.group, "layer"); }
    for (let n = 1; n <= 5; ++n) {
        const hotcue = deck.hotcuesContainer["hotCue" + n];
        if (hotcue.held) { engine.setValue(deck.group, hotcue.held, 0); hotcue.held = null; }
    }
};
NumarkNS6.touchStripInput = function(ch, ctrl, val, st, grp) { engine.setValue(grp, "playposition", val / 127.0); };
NumarkNS6.tapButtonInput = function(ch, ctrl, val, st, grp) { if (NumarkNS6.pressed(val, st)) { NumarkNS6.pulse(grp, "bpm_tap"); } };

// ==========================================================
// 🚀 ABSOLUTE BPM METER (four-deck view)
// ==========================================================
NumarkNS6.lastBpmLed = -1;
// `bpm` is already the effective, rate-adjusted BPM in Mixxx. Keep the
// centre precise without making it impossible to hit with a 14-bit fader.
NumarkNS6.bpmMeterCenterTolerance = 0.02;
NumarkNS6.bpmMeterLedValue = function(bpmLeft, bpmRight, rateRangeLeft, rateRangeRight) {
    if (bpmLeft <= 0 || bpmRight <= 0) { return 0; }
    const difference = bpmLeft - bpmRight;
    const center = 6;
    if (Math.abs(difference) <= NumarkNS6.bpmMeterCenterTolerance) { return center; }
    const pitchRange = Math.max(rateRangeLeft || 0, rateRangeRight || 0, 0.04);
    const meterStep = (Math.max(bpmLeft, bpmRight) * pitchRange) / 5;
    const offset = Math.ceil(Math.abs(difference) / meterStep);
    // The meter must move toward whichever deck is faster: left=fewer LEDs,
    // right=more LEDs; distance from center represents BPM difference.
    const ledValue = center + (difference > 0 ? -offset : offset);
    return Math.max(1, Math.min(11, ledValue));
};

NumarkNS6.updateBpmMeter = function() {
    if (NumarkNS6.isBooting) { return; } // 🛡️ Bloqueia durante a animação do Vegas Mode!

    // Get the exact deck numbers assigned to the visible layers.
    const left = NumarkNS6.leftDeck || 1;
    const right = NumarkNS6.rightDeck || 2;

    // Mixxx exposes `bpm` as the effective BPM: it already includes the
    // current pitch rate. Applying `rate` a second time doubles the pitch
    // effect and makes the indicator jump erratically.
    const leftGroup = `[Channel${  left  }]`;
    const rightGroup = `[Channel${  right  }]`;
    const bpm1 = engine.getValue(leftGroup, "bpm");
    const bpm2 = engine.getValue(rightGroup, "bpm");

    [left, right].forEach(function(n) {
        const slider = NumarkNS6.Decks[n].bpmSlider;
        const physical = NumarkNS6.physicalPitch[n % 2];
        if (!slider) { return; }
        const delta = engine.getParameter("[Channel" + n + "]", "rate") - physical - slider.offset;
        NumarkNS6.sendLed(0xB0 + n, NumarkNS6.pitchTakeoverLED.UP, delta > 0.004 ? 127 : 0);
        NumarkNS6.sendLed(0xB0 + n, NumarkNS6.pitchTakeoverLED.DOWN, delta < -0.004 ? 127 : 0);
    });

    const ledValue = NumarkNS6.bpmMeterLedValue(
        bpm1,
        bpm2,
        engine.getValue(leftGroup, "rateRange"),
        engine.getValue(rightGroup, "rateRange")
    );

    // Send a command only when the LED position needs to change (saves CPU).
    if (ledValue !== NumarkNS6.lastBpmLed) {
        midi.sendShortMsg(0xB0, 0x36, ledValue);
        NumarkNS6.lastBpmLed = ledValue;
    }
};


// =======================================================
// 🎛️ DYNAMIC EFFECTS MODULE (FX)
// =======================================================

NumarkNS6.FX = {bank: []};
NumarkNS6.FX.init = function() {
    ["Left", "Right"].forEach(function(side, i) {
        const unit = "[EffectRack1_EffectUnit" + (i + 1);
        const group = slot => unit + "_Effect" + slot + "]";
        const shifted = () => NumarkNS6.Decks[i ? NumarkNS6.rightDeck : NumarkNS6.leftDeck].shiftButton.state;
        const single = () => !!engine.getSetting("singleEffect");
        const bank = {lastTap: 0, down: null};
        NumarkNS6.FX.bank[i] = bank;
        const step = (g, key, value) => {
            if (value === 0 || value === 64 || NumarkNS6.reconnectBurst.isActive()) { return; }
            const change = value < 64 ? value : value - 128;
            engine.setParameter(g, key, Math.max(0, Math.min(1, engine.getParameter(g, key) + change / 32)));
        };
        NumarkNS6.FX["toggle" + side] = {input: function(ch, cc, v, st) {
            if (!NumarkNS6.pressed(v, st)) { return; }
            const g = group(!single() && shifted() ? 2 : 1);
            if (single() && shifted()) {
                engine.setParameter(g, "parameter2", engine.getParameter(g, "parameter2") < 0.5 ? 1 : 0);
            } else {
                engine.setValue(g, "enabled", +!engine.getValue(g, "enabled"));
            }
        }};
        NumarkNS6.FX["select" + side] = {input: function(ch, cc, value) {
            if (engine.getSetting("performanceFX") !== false) {
                step(group(shifted() ? 2 : 1), "meta", value);
            } else if (single()) { step(group(1), shifted() ? "parameter5" : "parameter3", value); }
            else { step(group(shifted() ? 3 : 2), "meta", value); }
        }};
        NumarkNS6.FX["encoder" + side] = {input: function(ch, cc, value) {
            if (value === 0 || value === 64 || NumarkNS6.reconnectBurst.isActive()) { return; }
            if (shifted()) { engine.setValue(group(1), "effect_selector", value < 64 ? 1 : -1); }
            else { step(group(1), "parameter1", value); }
        }};
        NumarkNS6.FX["press" + side] = function(ch, cc, v, st) {
            const now = Date.now(), g = group(1);
            if (NumarkNS6.pressed(v, st)) {
                if (bank.down === null) { bank.down = now; }
                return;
            }
            if (bank.down === null) { return; }
            const down = bank.down;
            bank.down = null;
            if (now - down >= 550) {
                engine.setValue(g, "parameter1", engine.getDefaultValue(g, "parameter1"));
                bank.lastTap = 0;
                return;
            }
            const interval = down - bank.lastTap;
            bank.lastTap = down;
            const deck = i ? NumarkNS6.rightDeck : NumarkNS6.leftDeck;
            const bpm = engine.getValue("[Channel" + deck + "]", "bpm");
            if (interval >= 100 && interval <= 2000 && bpm > 0) {
                // Echo and other tempo effects with time in parameter 1 use beat units.
                engine.setValue(g, "parameter1", interval * bpm / 60000);
            }
        };
        [1, 2].forEach(slot => engine.makeConnection(group(slot), "enabled", NumarkNS6.FX.updateLEDs));
    });
};
NumarkNS6.FX.updateLEDs = function() {
    if (NumarkNS6.isBooting) { return; }
    [NumarkNS6.leftDeck, NumarkNS6.rightDeck].forEach(function(deck, i) {
        const slot = !engine.getSetting("singleEffect") && NumarkNS6.Decks[deck].shiftButton.state ? 2 : 1;
        const g = "[EffectRack1_EffectUnit" + (i + 1) + "_Effect" + slot + "]";
        NumarkNS6.sendLed(0xB0, i ? 0x2E : 0x17, engine.getValue(g, "enabled") ? 1 : 0);
    });
};

NumarkNS6.FX.Assign = {};
NumarkNS6.FX.RoutingTable = [
    {note: 0x3D, led: 0x44, unit: 1, target: "[Channel1]"}, {note: 0x3E, led: 0x45, unit: 2, target: "[Channel1]"},
    {note: 0x3F, led: 0x46, unit: 1, target: "[Channel2]"}, {note: 0x40, led: 0x47, unit: 2, target: "[Channel2]"},
    {note: 0x41, led: 0x48, unit: 1, target: "[Channel3]"}, {note: 0x42, led: 0x49, unit: 2, target: "[Channel3]"},
    {note: 0x43, led: 0x4A, unit: 1, target: "[Channel4]"}, {note: 0x44, led: 0x4B, unit: 2, target: "[Channel4]"},
    {note: 0x45, led: 0x4C, unit: 1, target: "[Master]"}, {note: 0x46, led: 0x4D, unit: 2, target: "[Master]"}
];

NumarkNS6.FX.initRouting = function() {
    NumarkNS6.FX.RoutingTable.forEach(function(cfg) {
        const group = `[EffectRack1_EffectUnit${  cfg.unit  }]`, key = `group_${  cfg.target  }_enable`;
        NumarkNS6.FX.Assign[`btn_${  cfg.unit  }_${  cfg.target.replace(/[[\]]/g, "")}`] = new components.Button({
            midi: [0x90, cfg.note], group: group, key: key,
            input: function(ch, ctrl, val, st, grp) { if (val > 0) { engine.setValue(grp, key, !engine.getValue(grp, key)); } }
        });
        const fxConn = engine.makeConnection(group, key, function(v) { if (!NumarkNS6.isBooting) { midi.sendShortMsg(0xB0, cfg.led, v > 0 ? 0x7F : 0x00); } });
        if (fxConn) { fxConn.trigger(); }
    });
};


// =======================================================
// 🌙 SHUTDOWN
// =======================================================

NumarkNS6.shutdown = function() {
    NumarkNS6.shuttingDown = true;
    NumarkNS6.reconnectBurst.cancel();
    // 1. Stop all timers immediately.
    if (NumarkNS6.displayTimer !== 0) { engine.stopTimer(NumarkNS6.displayTimer); }
    if (NumarkNS6.navTimer !== 0) { engine.stopTimer(NumarkNS6.navTimer); }
    if (NumarkNS6.blinkTimer !== 0) { engine.stopTimer(NumarkNS6.blinkTimer); }
    if (NumarkNS6.animTimer !== 0) { engine.stopTimer(NumarkNS6.animTimer); }
    if (NumarkNS6.parachuteTimer !== 0) { engine.stopTimer(NumarkNS6.parachuteTimer); }
    if (NumarkNS6.startupWakeTimer !== 0) { engine.stopTimer(NumarkNS6.startupWakeTimer); }
    NumarkNS6.displayTimer = 0;
    NumarkNS6.navTimer = 0;
    NumarkNS6.blinkTimer = 0;
    NumarkNS6.animTimer = 0;
    NumarkNS6.parachuteTimer = 0;
    NumarkNS6.startupWakeTimer = 0;
    NumarkNS6.pendingTimers.forEach(function(pending) {
        engine.stopTimer(pending.id);
        if (pending.onCancel) { pending.onCancel(); }
    });
    NumarkNS6.pendingTimers = [];
    for (let volumeChannel = 1; volumeChannel <= 4; volumeChannel++) {
        if (NumarkNS6.Decks[volumeChannel]) { NumarkNS6.Decks[volumeChannel].bpmSlider.cancelStartupTimer(); }
    }
    // Release the platter motors and cancel each deck's scrub timer.
    for (let deckNum = 1; deckNum <= 4; deckNum++) {
        var deck = NumarkNS6.Decks[deckNum];
        if (!deck) { continue; }
        ["scrubTimer", "scratchReleaseTimer", "playbackGuardTimer", "cueIntentSyncTimer", "cueGuardTimer", "blinkTimer"].forEach(function(timerName) {
            if (deck[timerName] !== undefined && deck[timerName] !== 0) {
                engine.stopTimer(deck[timerName]);
                deck[timerName] = 0;
            }
        });
        NumarkNS6.releaseDeckGestures(deck);
        deck.scratchReleasePending = false;
        deck.isAutoScrubbing = false;
        engine.scratchDisable(deckNum);
    }

    // Clear mapped LEDs only; blanket CC writes also touch the controller's non-LED state.
    [0x01, 0x03, 0x04, 0x05, 0x08, 0x17, 0x2E, 0x36].forEach(function(cc) {
        midi.sendShortMsg(0xB0, cc, 0);
    });
    for (let fxLed = 0x44; fxLed <= 0x4D; fxLed++) { midi.sendShortMsg(0xB0, fxLed, 0); }
    [0x02, 0x03].forEach(function(note) { midi.sendShortMsg(0x80, note, 0); });
    const deckLeds = [0x07, 0x08, 0x09, 0x10, 0x12, 0x15, 0x16, 0x18,
        0x19, 0x1A, 0x1B, 0x1C, 0x1E, 0x21, 0x37, 0x3A, 0x3C, 0x3D, 0x4E];
    for (var deckChannel = 1; deckChannel <= 4; deckChannel++) {
        for (let hotcueLed = 0x0B; hotcueLed <= 0x0F; hotcueLed++) { midi.sendShortMsg(0xB0 + deckChannel, hotcueLed, 0); }
        deckLeds.forEach(function(cc) { midi.sendShortMsg(0xB0 + deckChannel, cc, 0); });
    }

    // 3. Restore Mixxx's original crossfader curve.
    if (!NumarkNS6.crossfaderChanged || (NumarkNS6.Mixer && NumarkNS6.Mixer.changeCrossfaderContour && NumarkNS6.Mixer.changeCrossfaderContour.state)) {
        Object.keys(NumarkNS6.storedCrossfaderParams).forEach(function(ctrl) { engine.setValue("[Mixer Profile]", ctrl, NumarkNS6.storedCrossfaderParams[ctrl]); });
    }

    // 4. Final SysEx signal.
    midi.sendSysexMsg([0xF0, 0x00, 0x01, 0x3F, 0x7F, 0x79, 0x60, 0x00, 0x01, 0x49, 0x01, 0x00, 0x00, 0x00, 0x00, 0xF7], 16);
    print("Numark NS6: shutdown complete.");
};
