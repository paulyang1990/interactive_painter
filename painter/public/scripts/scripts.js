/**
 * This file is for the websocket data transfer and drawing on canvases
 */
var ws; // global websocket

var drawing = 0;
var mousedown = 0;
var canvas_inited = 0;

var last_x = -1;
var last_y = -1;

var buf_x = 0;
var buf_y = 0;

var undoed = 0;

var timeout = true; // if true, then we can detect mouse moves, used to prevent too much data transfer

// colors for username display
var color_arr = [
  "#ffdab9", // peach puff
  "#87cefa", // light sky blue
  "#adff2f", // green yellow
  "#ffd700", // gold
  "#ff6347", // tomato
  "#ee82ee", // violet
];

// Following are the global variables describing the user's current state,
// when changing the properties using the toolbar or others, just update
// these variables
var username_g; // name of the user
var userid_g; // id of the user
var currtool_g = "pen"; // the tool (shape) the user is using
var currfg_g = [0, 0, 0]; // the current foreground color
var currbg_g = [255, 255, 255]; // the current background color
var currfill_g = 0; // whether to fill or not
var currwidth_g = 1; // the current width of line
var usercolor_g; // color used to display the user's name

if ( WebSocket.__initialize ) {
}

function time_out() {
  timeout = true;
}

function init_socket() {
  setInterval(time_out, 20); // allow mouse move detection every 20 milliseconds

  ws = new WebSocket('ws://localhost:3389/server');

  ws.onopen = function() {
    var action = { // new a user
      action: "new_user",
      username: username_g
    };
    ws.send(JSON.stringify(action));
  };

  ws.onmessage = function(e) { // when the client receives a message
    var data = jQuery.parseJSON(e.data);
    var action = data.action;

    switch (action) {
      case "new_user":
        if (!data.permission) {
          alert("username already in use");
          login();
        }
        init_detector();
        userid_g = data.userid; // assign an id to the user
        usercolor_g = color_arr[userid_g % color_arr.length]; // initialize user's color, fixed after it
        for (var i = 0; i < data.allid.length; i++) {
          add_canvas(data.allid[i]); // add the existing canvases
        }
        for (var i = 0; i < data.segs.length; i++) {
          draw_canvas(jQuery.parseJSON(data.segs[i]));
        }
        for (var i = 0; i < data.chats.length; i++) {
          chat_received(jQuery.parseJSON(data.chats[i]));
        }
        break;
      case "new_canvas":
        if (data.userid != -1) {
          add_canvas(data.userid);
        }
        break;
      case "draw":
        draw_canvas(data);
        break;
      case "begin_seg":
        move_canvas_to_top(data.userid);
        for (var i = 0; i < data.segs.length; i++) {
          draw_canvas(jQuery.parseJSON(data.segs[i]));
        }
        break;
      case "undo":
        $("#layer" + data.userid).get(0).getContext('2d').clearRect(0, 0, 800, 600);
        break;
      case "redo":
        for (var i = 0; i < data.segs.length; i++) {
          draw_canvas(jQuery.parseJSON(data.segs[i]));
        }
        break;
      case "chat":
        chat_received(data);
        break;
    }
  };

  ws.onclose = function() { // when socket is closed, do nothing now
  };
}

function init_detector() {
  $("#detector").mousedown(canvas_mousedown);
  $("#detector").mouseup(canvas_mouseup);
  $("#detector").mousemove(canvas_mousemove);
  $("#detector").mouseover(canvas_mouseover);
  $("#detector").mouseout(canvas_mouseout);
}

function add_canvas(canvas_id) {
  $("<canvas id=\"layer" + canvas_id + "\" width=\"800\"height=\"600\"></canvas>")
      .insertAfter($("#canvas"));
}

function move_canvas_to_top(canvas_id) {
  $("#layer" + canvas_id).insertBefore($("#detector"));
}

function draw_canvas(data) {
  var cxt;
  if (data.tentative) { // draw the the layers above
    if ($("#layer" + data.userid).get(0) !== undefined) {
      cxt = $("#layer" + data.userid).get(0).getContext('2d');
    }
  } else { // draw on the base canvas
    cxt = $("#canvas").get(0).getContext('2d');
    if ($("#layer" + data.userid).get(0) !== undefined) {
      $("#layer" + data.userid).get(0).getContext('2d')
          .clearRect(0, 0, 800, 600); // clear the canvas
    }
  }
  var fgcolor = "#" + data.fg[0].toString(16) + 
      data.fg[1].toString(16) + data.fg[2].toString(16);
  var bgcolor = "#" + data.bg[0].toString(16) + 
      data.bg[1].toString(16) + data.bg[2].toString(16);
  cxt.strokeStyle = fgcolor;
  cxt.fillStyle = bgcolor;
  cxt.lineWidth = data.width;
  switch (data.shape) {
    case "pen":
      cxt.beginPath();
      cxt.moveTo(data.start[0], data.start[1]);
      cxt.lineTo(data.end[0], data.end[1]);
      cxt.stroke();
      cxt.closePath();
      break;
    case "line":
      if ($("#layer" + data.userid).get(0) !== undefined) {
        $("#layer" + data.userid).get(0).getContext('2d')
            .clearRect(0, 0, 800, 600); // clear the users canvas
      }
      cxt.beginPath();
      cxt.moveTo(data.start[0], data.start[1]);
      cxt.lineTo(data.end[0], data.end[1]);
      cxt.stroke();
      cxt.closePath();
      break;
    case "rect":
      if ($("#layer" + data.userid).get(0) !== undefined) {
        $("#layer" + data.userid).get(0).getContext('2d')
            .clearRect(0, 0, 800, 600); // clear the users canvas
      }
      if (data.fill) {
        cxt.fillRect(data.start[0], data.start[1], data.end[0] - data.start[0], data.end[1] - data.start[1]);
      }
      cxt.strokeRect(data.start[0], data.start[1], data.end[0] - data.start[0], data.end[1] - data.start[1]);
      break;
    case "ellipse":
      if ($("#layer" + data.userid).get(0) !== undefined) {
        $("#layer" + data.userid).get(0).getContext('2d')
            .clearRect(0, 0, 800, 600); // clear the users canvas
      }
      break;
    case "eraser":
      break;
  }
  // draw the username at the end of the line segment
  if (data.username != username_g) {
    var name_len = data.username.length;
    var rect_len = 16 + name_len * 6;
    var x = data.end[0];
    var y = data.end[1];

    cxt = $("#detector").get(0).getContext('2d');
    cxt.strokeStyle = data.usercolor;
    cxt.clearRect(0, 0, 800, 600); // clear the detector canvas
    cxt.strokeRect(x + 2, y + 2, rect_len, 15);
    cxt.fillText(data.username, x + 10, y + 12);
  }
}

function chat_received(data) {
  console.log(data.color);
  var username = "<p class=\"chat_name\"><font color=" + data.color + ">" + data.username + "</font></p>";
  var time = "<p class=\"chat_time\">" + data.time + "</p>";
  var content = "<p class=\"chat_content\">" + data.content + "</p>";
  var chat_entry = "<div class=\"chat_entry\">" + username + time + content + "</div>";

  $("#message_box").append(chat_entry);
  $("#message_box").get(0).scrollTop = $("#message_box").get(0).scrollHeight;
}

function canvas_mousedown(e) {
  mousedown = 1;
  drawing = 1;
  var action = {
    action: "begin_seg",
    userid: userid_g,
    undoed: undoed
  };
  ws.send(JSON.stringify(action));
  undoed = 0;
}

function canvas_mouseup(e) {
  mousedown = 0;
  drawing = 0;
  last_x = -1;
  last_y = -1;
}

function canvas_mousemove(e) {
  // Here we should send consecutive msgs to the server for updating
  if (timeout) {
    if (drawing) {
      var x_pos = e.layerX;
      var y_pos = e.layerY;
      switch (currtool_g) {
        case "pen":
          if (last_x == -1 && last_y == -1) {
            last_x = x_pos;
            last_y = y_pos;
          } else {
            var action = {
              action: "draw",
              userid: userid_g,
              shape: "pen",
              start: [last_x, last_y],
              end: [x_pos, y_pos],
              fg: currfg_g,
              bg: currbg_g,
              width: currwidth_g,
              fill: currfill_g,
              tentative: 1,
              usercolor: usercolor_g
            };
            ws.send(JSON.stringify(action));
            last_x = x_pos;
            last_y = y_pos;
          }
          break;
        case "line":
          if (last_x == -1 && last_y == -1) {
            last_x = x_pos;
            last_y = y_pos;
          } else {
            var action = {
              action: "draw",
              userid: userid_g,
              shape: "line",
              start: [last_x, last_y],
              end: [x_pos, y_pos],
              fg: currfg_g,
              bg: currbg_g,
              width: currwidth_g,
              fill: currfill_g,
              tentative: 1,
              usercolor: usercolor_g
            };
            ws.send(JSON.stringify(action));
          }
          break;
        case "rect":
          if (last_x == -1 && last_y == -1) {
            last_x = x_pos;
            last_y = y_pos;
          } else {
            var action = {
              action: "draw",
              userid: userid_g,
              shape: "rect",
              start: [last_x, last_y],
              end: [x_pos, y_pos],
              fg: currfg_g,
              bg: currbg_g,
              width: currwidth_g,
              fill: currfill_g,
              tentative: 1,
              usercolor: usercolor_g
            };
            ws.send(JSON.stringify(action));
          }
          break;
        case "ellipse":
          break;
        case "eraser":
          break;
      }
    }
    timeout = false;
  }
}

function canvas_mouseover(e) {
  if (mousedown) {
    drawing = 1;
    var action = {
      action: "begin_seg",
      userid: userid_g,
      undoed: undoed
    };
    ws.send(JSON.stringify(action));
  }
}

function canvas_mouseout(e) {
  drawing = 0;
  last_x = -1;
  last_y = -1;
}

function undo() {
  if (!undoed) {
    undoed = 1;
    var action = {
      action: "undo",
      userid: userid_g,
    };
    ws.send(JSON.stringify(action));
  }
}

function redo() {
  if (undoed) {
    undoed = 0;
    var action = {
      action: "redo",
      userid: userid_g
    };
    ws.send(JSON.stringify(action));
  }
}

function send_chat() {
  if ($("#talk_area").val()) {
    var action = {
      action: "chat",
      username: username_g,
      time: new Date().toString(),
      content: $("#talk_area").val(),
      color: usercolor_g
    };
    ws.send(JSON.stringify(action));
    $("#talk_area").val("");
  }
}

function login() {
  var set_name = function() {
    var name = $("#name_input").val();
    if (name != '') {
      $("#name_dialog").dialog("close");
      username_g = name;
      $("#username").text(name);
      init_socket();
    }
  };

  var dialogOpts = { // options
    buttons: {
      "Ok": set_name,
    }
  };

  var show_dialog = function() {
    $("#name_dialog").dialog(
      dialogOpts,
      {
        modal: true,
        resizable: false,
      }
    );
    $(".ui-dialog-titlebar").hide(); // hide the title bar
  };
  show_dialog();
}

function make_url() {
  var url = $("#canvas").get(0).toDataURL();
}

$(document).ready(function() {
  login();
  init_ui();
});
