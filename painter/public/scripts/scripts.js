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

// used to store all the users that have logged in
var usernames = [];

var userbufs = {};

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
  setInterval(time_out, 30); // allow mouse move detection every 20 milliseconds
  ws = new WebSocket('ws://143.89.231.37:3389/server');

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
          // not permitted, display an error message
          var dialogOpts = { // options
            buttons: {
              "Ok": function() {
                $("#username_in_use").dialog("close");
                login();
              }
            }
          };
          $("#username_in_use").dialog(
            dialogOpts,
            {
              modal: true,
              resizable: false,
            }
          );
          // hide the title bar
          $(".ui-dialog-titlebar").hide(); // hide the title bar
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
        for (var i = 0; i < data.allname.length; i++) {
          user_login(data.allname[i]);
        }
        break;
      case "new_canvas":
        if (data.userid != -1) {
          add_canvas(data.userid);
          if (data.username != username_g) {
            user_login(data.username);
          }
        }
        break;
      case "user_logout":
        user_logout(data.username);
        break;
      case "draw":
        draw_canvas(data);
        break;
      case "begin_seg":
        move_canvas_to_top(data.userid);
        username_shine(data.username, color_arr[data.userid]);
        for (var i = 0; i < data.segs.length; i++) {
          draw_canvas(jQuery.parseJSON(data.segs[i]));
        }
        break;
      case "end_seg":
        stop_username_shine(data.username);
        clear_usercap(data.username);
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
}

function init_detector() {
  $("#detector").mousedown(canvas_mousedown);
  $("#detector").mouseup(canvas_mouseup);
  $("#detector").mousemove(canvas_mousemove);
  $("#detector").mouseover(canvas_mouseover);
  $("#detector").mouseout(canvas_mouseout);
}

// add a user to the online user display when a new user is in
function user_login(username) {
  if (is_new_user(username)) { // a new user that never logged in before
    usernames.push(username); // store the username in the array
    var user_entry = "<div id=\"user_" + username + "\" class=\"user_entry\"><p>" + username + "</p></div>";
    if ($("#user_" + username_g).length == 0) {
      $("#online_user").append(user_entry);
    } else {
      $(user_entry).insertAfter($("#user_" + username_g));
    }
  } else { // a user that have logged in
    $("#user_" + username + " p").css("color", "#000");
    $("#user_" + username).insertAfter($("#user_" + username_g));
  }
}

// delete a user from the online user display when it logs out
function user_logout(username) {
  $("#user_" + username + " p").remove();
  var user_entry = "<div id=\"user_" + username + "\" class=\"user_entry\"><p>" + username + "</p></div>";
  $("#online_user").append(user_entry); // put the user's name to the last place
  $("#user_" + username + " p").css("color", "#CCC");
  clear_usercap(username);
}

function add_canvas(canvas_id) {
  $("<canvas id=\"layer" + canvas_id + "\" class=\"layer\" width=\"800\" height=\"600\"></canvas>")
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
  cxt.lineCap = "round";
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
      draw_ellipse(cxt, data.start[0], data.start[1], 
          data.end[0] - data.start[0], data.end[1] - data.start[1], data.fill);
      break;
    case "eraser":
      cxt.strokeStyle = bgcolor;
      cxt.beginPath();
      cxt.moveTo(data.start[0], data.start[1]);
      cxt.lineTo(data.end[0], data.end[1]);
      cxt.stroke();
      cxt.closePath();
      break;
  }
  // draw the username at the end of the line segment
  if (data.username != username_g) {
    var x = data.end[0];
    var y = data.end[1];

    cxt = $("#detector").get(0).getContext('2d');
    cxt.strokeStyle = data.usercolor;
    cxt.fillStyle = data.usercolor;
    if (userbufs[data.username]) {
      cxt.clearRect(userbufs[data.username][0] - 10, 
          userbufs[data.username][1] - 10, 20, 20); // clear the detector canvas
    }
    cxt.beginPath();
    cxt.arc(x, y, 5, 0, 2 * Math.PI, false);
    cxt.stroke();
    cxt.fill();
  }
  userbufs[data.username] = [x, y];
}

function chat_received(data) {
  var username = "<p class=\"chat_name\"><font color=" + data.color + ">" + data.username + "</font></p>";
  var time = "<p class=\"chat_time\">" + data.time + "</p>";
  var content = "<p class=\"chat_content\">" + data.content + "</p>";
  var chat_entry = "<div class=\"chat_entry\">" + username + time + content + "</div>";

  $("#message_box").append(chat_entry);
  $("#message_box").get(0).scrollTop = $("#message_box").get(0).scrollHeight;
}

function canvas_mousedown(e) {
  mousedown = 1;
  drawing = 1; // restore background color
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
  var action = {
    action: "end_seg",
    userid: userid_g
  };
  ws.send(JSON.stringify(action));
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
          if (last_x == -1 && last_y == -1) {
            last_x = x_pos;
            last_y = y_pos;
          } else {
            var action = {
              action: "draw",
              userid: userid_g,
              shape: "ellipse",
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
        case "eraser":
          if (last_x == -1 && last_y == -1) {
            last_x = x_pos;
            last_y = y_pos;
          } else {
            var action = {
              action: "draw",
              userid: userid_g,
              shape: "eraser",
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
    if (name != '' && name.length <= 16) {
      $("#name_dialog").dialog("close");
      username_g = name;
      $("#username").text(name);
      init_socket();
      user_login(name);
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

$(document).ready(function() {
  login();
  init_ui();
});
