// Optional Studio DJ mapping extension. Original mapping stays byte-identical.
// Loaded after the original NumarkNS6 script, with StudioNS6.init as the init function.
var StudioNS6 = {};
StudioNS6.isStudio = function() {
    return engine.getValue("[NS6Surface]", "installed") === 1;
};
StudioNS6.shifted = function() {
    for (let i=1;i<=4;i++) {
        const d=NumarkNS6.Decks[i];
        if (d && d.shiftButton && d.shiftButton.state) { return true; }
    }
    return false;
};
StudioNS6.openBrowse = function(target) {
    if (StudioNS6.isStudio()) {
        engine.setValue("[Skin]", "show_maximized_library", 1);
    }
    NumarkNS6.focusLibraryWidget(target);
};
StudioNS6.preview = function() {
    if (engine.getValue("[PreviewDeck1]", "play") > 0) {
        NumarkNS6.pulse("[PreviewDeck1]", "stop");
    } else {
        NumarkNS6.pulse("[PreviewDeck1]", "LoadSelectedTrackAndPlay");
    }
};
StudioNS6.canLoad = function(group, deck) {
    // Fail closed on unknown groups, startup, active transport and pending scratch handoff.
    return Boolean(deck && NumarkNS6.groupToDeck[group] && !NumarkNS6.isBooting
        && !(engine.getValue(group,"play") > 0)
        && !deck.transportWantsPlay && !deck.jogTouched && !deck.cuePressed
        && !deck.scratchReleasePending && !deck.isAutoScrubbing);
};
StudioNS6.load = function(group, deck) {
    if (!StudioNS6.canLoad(group,deck)) {
        print("Studio DJ: LOAD/EJECT blocked on busy deck " + group);
        return false;
    }
    NumarkNS6.pulse(group,deck.shiftButton && deck.shiftButton.state ? "eject" : "LoadSelectedTrack");
    return true;
};
StudioNS6.install = function() {
    const m=NumarkNS6.Mixer;
    // The original MIDI dispatch targets the component input functions by name.
    m.cratesButton.input=function(ch,ctrl,val,status) {
        if (NumarkNS6.pressed(val,status) && !NumarkNS6.sortIfShifted("TITLE")) {
            StudioNS6.openBrowse(2);
        }
    };
    m.filesButton.input=function(ch,ctrl,val,status) {
        if (NumarkNS6.pressed(val,status) && !NumarkNS6.sortIfShifted("BPM")) {
            StudioNS6.openBrowse(3);
        }
    };
    m.viewButton.input=function(ch,ctrl,val,status) {
        if (!NumarkNS6.pressed(val,status)) { return; }
        if (StudioNS6.isStudio() && engine.getValue("[Skin]","show_maximized_library") > 0) {
            engine.setValue("[Skin]","show_maximized_library",0);
        } else {
            NumarkNS6.toggleDeckLayout();
        }
    };
    // Do not repurpose an Auto DJ queue as a Tag List. Until a real queue exists,
    // LOAD PREPARE auditions the selected track. Neither shortcut toggles Auto DJ.
    m.autoDjAddButton.input=function(ch,ctrl,val,status) {
        if (NumarkNS6.pressed(val,status)) { StudioNS6.preview(); }
    };
    const originalEncoder=m.navigationEncoderButton.input;
    m.navigationEncoderButton.input=function(ch,ctrl,val,status) {
        if (!NumarkNS6.pressed(val,status)) { return; }
        if (StudioNS6.shifted()) { StudioNS6.preview(); }
        else { originalEncoder.apply(this,arguments); }
    };
    for (let i=1;i<=4;i++) {
        const deck=NumarkNS6.Decks[i];
        const group="[Channel"+i+"]";
        deck.loadButton.input=function(ch,ctrl,val,status,actualGroup) {
            if (NumarkNS6.pressed(val,status) && actualGroup===group) {
                StudioNS6.load(group,deck);
            }
        };
    }
};
StudioNS6.init = function() {
    NumarkNS6.init.apply(NumarkNS6,arguments);
    StudioNS6.install();
    print("Studio DJ: optional navigation and safe LOAD/EJECT overlay installed");
};
