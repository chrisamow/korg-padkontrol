loadAPI(1);

host.defineController("Korg", "padKONTROL", "1.0", "6C7FD3BD-B1F3-4A0A-A745-F2D53FFC603D");
host.defineMidiPorts(2, 1);

host.addDeviceNameBasedDiscoveryPair(["padKONTROL", "MIDIIN3 (padKONTROL)"], ["MIDIOUT2 (padKONTROL)"]);
host.addDeviceNameBasedDiscoveryPair(["padKONTROL MIDI 1", "padKONTROL MIDI 3"], ["padKONTROL MIDI 2"]);

var Mode =
{
   Drum:0
};

var mode = Mode.Undefined;

var Light =
{
   PAD01:0,
   PAD02:1,
   PAD03:2,
   PAD04:3,
   PAD05:4,
   PAD06:5,
   PAD07:6,
   PAD08:7,
   PAD09:8,
   PAD10:9,
   PAD11:10,
   PAD12:11,
   PAD13:12,
   PAD14:13,
   PAD15:14,
   PAD16:15,
   SCENE:16,
   MESSAGE:17,
   SETTING:18,
   NOTECC:19,
   MIDICH:20,
   SWTYPE:21,
   RELVAL:22,
   VEL:23,
   PORT:24,
   FIXEDVEL:25,
   PROGCHANGE:26,
   X:27,
   Y:28,
   KNOB1:29,
   KNOB2:30,
   PEDAL:31,
   ROLL:32,
   FLAM:33,
   HOLD:34,
   COUNT:35
};

var LightState =
{
   OFF:0,
   ON:32,
   BLINKING:0x63,
   BLINK_SHORTEST:0x41,
   BLINK_LONGEST:0x5f
};

var Button =
{
   UNDEFINED:-1,
   SCENE:0,
   MESSAGE:1,
   SETTING:2,
   NOTE_CC:3,
   MIDI_CH:4,
   SW_TYPE:5,
   REL_VAL:6,
   VELOCITY:7,
   PORT:8,
   FIXED_VELOCITY:9,
   PROG_CHANGE:10,
   X:11,
   Y:12,
   KNOB1_ASSIGN:13,
   KNOB2_ASSIGN:14,
   PEDAL:15,
   ROLL:16,
   FLAM:17,
   HOLD:18,
   XY_PRESS:32
};

var tempMode = Button.UNDEFINED;

var Observer =
{
   IS_PLAYING:0,
   IS_RECORDING:1,
   TRACK_NAME:2
};
var isPlaying = initArray(0, 16);
var isQueued = initArray(0, 16);

var hold = false;

function init()
{
   noteInput = host.getMidiInPort(1).createNoteInput("", "8A????", "9A????");
   //host.getMidiInPort(0).setMidiCallback(onMidi);
   host.getMidiInPort(0).setSysexCallback(onSysex);

   keyTranslationTable = initArray(0, 128);

   for(var i=0; i<16; i++)
   {
      var col = i & 3;
      var row = i >> 2;
      keyTranslationTable[i+1] = 36 + col + (3 - row) * 4;  // flip y-direction of pads to match the "standard" 16-pad layout
   }

   noteInput.setKeyTranslationTable(keyTranslationTable);

   cursorTrack = host.createCursorTrackSection(2, 0);
   cursorTrack.addNoteObserver(onNote);

   primaryDevice = cursorTrack.getPrimaryDevice();

   /* CURSOR TRACK */
   // Enter Native Mode
   sendSysex("f0 42 40 6e 08 00 00 01 f7");

   // packet comm. #1 (section 3-1, fig 17, pg. 6)
   // see table 3 for the packet format
   sendSysex("f0 42 40 6e 08 3f 2a 00 00 05 05 05 7f 7e 7f 7f 03 0a 0a 0a 0a 0a 0a 0a 0a 0a 0a 0a 0a 0a 0a 0a 0a 01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f 10 f7");

   // packet comm. #2 (section 3-1, fig 19, pg. 7)
   // see table 4 for the packet format
   sendSysex("F0 42 40 6E 08 3F 0A 01 00 00 00 00 00 00 29 29 29 F7");

   setMode(Mode.Drum);
   updateIndications();
}

var playingKeys = initArray(false, 128);

function onNote(state, key, vel)
{
   //println("onNote:" + key + "," + state + "," + vel);
   playingKeys[key] = state;
}

function exit()
{
   sendSysex("f0 42 40 6e 08 00 00 00 f7");   // Turn off native mode
   sendSysex("f0 42 40 6e 08 1f 14 00 f7");   // Select scene 0
}

var pendingState = initArray(false, Light.COUNT);
var outputState = initArray(-1, Light.COUNT);

function prepareDisplay()
{
   for(var i=0; i<16; i++)
   {
      var key = 36 + i;
      var row =  3 - (i >> 2);
      var column = i & 3;

      setButtonLight(Light.PAD01 + column + 4 * row, playingKeys[key]);
   }

   setButtonLight(Light.KNOB1, macroOffset != 0);
   setButtonLight(Light.KNOB2, macroOffset != 6);
   setButtonLight(Light.HOLD, hold);

   setButtonLight(Light.PROGCHANGE, tempMode == Button.PROG_CHANGE);
   setButtonLight(Light.MIDICH, tempMode == Button.MIDI_CH);
}

var macroOffset = 0;

function setButtonLight(light, state)
{
   pendingState[light] = state ? LightState.ON : LightState.OFF;
}

function sendButtonLight(light, state)
{
   sendSysex("f0 42 40 6e 08 01 " + uint7ToHex(light) + " " + uint7ToHex(state) + " f7");
}

function flush()
{
   prepareDisplay();

   for(var i=0; i<Light.COUNT; i++)
   {
      if (pendingState[i] != outputState[i])
      {
         sendButtonLight(i, pendingState[i]);
         outputState[i] = pendingState[i];
      }
   }
}

/**
 * @param {MidiMessage} msg
 */
function onMidi(status, data1, data2)
{
   //printMidi(status, data1, data2);
}

/**
 * @override
 */
function onSysex(data)
{
   //printSysex(data);
   if (data.matchesHexPattern("f0 42 40 6e 08 48 ?? ?? f7"))  // NORMAL BUTTONS
   {
      var button = data.hexByteAt(6);
      var value = data.hexByteAt(7);
      var buttonPressed = value > 0;

      switch (button)
      {
         case Button.SCENE:
            break;
         case Button.MESSAGE:
            break;
         case Button.FIXED_VELOCITY:
            break;

         case Button.PROG_CHANGE:
         case Button.MIDI_CH:
            setTempMode(button, buttonPressed);
            break;

         case Button.XY_PRESS:
            pressXY(buttonPressed);
            break;
         case Button.X:
            break;
         case Button.Y:
            break;
         case Button.PEDAL:
            break;
         case Button.VELOCITY:
            break;
         case Button.REL_VAL:
            break;
         case Button.PORT:
            break;
         case Button.NOTE_CC:
            break;
         case Button.SW_TYPE:
            break;
         case Button.HOLD:
            if (buttonPressed)
            {
               hold = !hold;

               if (!hold && !isXYPressed)
               {
                  primaryDevice.getCommonParameter(0).set(64, 128);
                  primaryDevice.getCommonParameter(1).set(64, 128);
               }
            }
            break;
         case Button.FLAM:
            break;
         case Button.ROLL:
            break;

         case Button.KNOB1_ASSIGN:
            if (buttonPressed)
            {
               macroOffset = Math.max(0, macroOffset - 2);
               showMacroOffsetInDisplay();
               updateIndications();
            }
            break;
         case Button.KNOB2_ASSIGN:
            if (buttonPressed)
            {
               macroOffset = Math.min(6, macroOffset + 2);
               showMacroOffsetInDisplay();
               updateIndications();
            }
            break;
      }
   }
   else if (data.matchesHexPattern("F0 42 40 6E 08 43 00 ?? F7")) // DATA WHEEL
   {
      var value = data.hexByteAt(7);
      var delta = uint7ToInt7(value);
      onDataWheel(delta);
   }
   else if (data.matchesHexPattern("F0 42 40 6E 08 4B ?? ?? F7")) // XY position
   {
      var x = data.hexByteAt(6);
      var y = data.hexByteAt(7);

      if (hold || isXYPressed)
      {
         primaryDevice.getCommonParameter(0).set(x, 128);
         primaryDevice.getCommonParameter(1).set(y, 128);
      }
   }
   else if (data.matchesHexPattern("F0 42 40 6E 08 49 ?? ?? F7")) // Knob
   {
      var index = data.hexByteAt(6);
      var value = data.hexByteAt(7);

      primaryDevice.getMacro(index + macroOffset).getAmount().set(value, 128);
   }
   else if (data.matchesHexPattern("F0 42 40 6E 08 45 ?? ?? F7")) // Pads
   {
      var padInfo = data.hexByteAt(6);
      var velocity = data.hexByteAt(7);
      onPad(padInfo & 0xF, (padInfo & 0x40), velocity);
   }
   else
   {
      //printSysex(data);
   }
}

function onDataWheel(delta)
{
   switch(tempMode)
   {
      case Button.PROG_CHANGE:
         if (delta > 0) primaryDevice.switchToNextPreset();
         else primaryDevice.switchToPreviousPreset();
         break;

      case Button.MIDI_CH:
         if (delta > 0) cursorTrack.selectNext();
         else cursorTrack.selectPrevious();
         break;
   }
}

function setTempMode(button, pressed)
{
   if (pressed)
   {
      tempMode = button;
   }
   else
   {
      tempMode = Button.UNDEFINED;
   }
}

function updateIndications()
{
   for(var i=0; i<8; i++)
   {
      primaryDevice.getMacro(i).getAmount().setIndication((i & 0xE) == macroOffset);
   }
}

function showMacroOffsetInDisplay()
{
   switch (macroOffset)
   {
      case 0:
         setDisplay("M12", false);
         break;
      case 2:
         setDisplay("M34", false);
         break;
      case 4:
         setDisplay("M56", false);
         break;
      case 6:
         setDisplay("M78", false);
         break;
   }
}

function onPad(pad, isOn, velocity)
{
   var x = pad & 0x3;
   var y = pad >> 2;

   if (mode == Mode.Drum)
   {
      var noteIndex = x + (3 - y) * 4;
   }
}

function setDisplay(text, blink)
{
   var blinkHex = blink ? "01" : "00";
   sendSysex("f0 42 40 6e 08 22 04 " + blinkHex + text.toHex(3) + "f7");
}

function setMode(m)
{
   mode = m;

   switch (m)
   {
      case Mode.Drum:
         setDisplay("DRM", false);
         break;

   }
}

var isXYPressed = false;

function pressXY(isPressed)
{
    if (isPressed != isXYPressed)
    {
       if (!isPressed && !hold)
       {
          primaryDevice.getCommonParameter(0).set(64, 128);
          primaryDevice.getCommonParameter(1).set(64, 128);
       }
    }

    isXYPressed = isPressed;
}
