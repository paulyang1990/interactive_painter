if ( WebSocket.__initialize ) {
  WebSocket.__swfLocation = 'web-socket-js/WebSocketMain.swf';
}

var ws;

function init_socket() {
  ws = new WebSocket('ws://143.89.218.59:3389/server');

  ws.onopen = function() {
    var action = {
      action: "new_user",
      username: $("#name_input").val()
    };
    ws.send(JSON.stringify(action));
    init_canvas();
  };

  ws.onmessage = function(e) { // when the client receives a message
    var data = jQuery.parseJSON(e.data);
    var action = data.action;
    if (action == "new_canvas") { // add new canvas
      add_canvas(data.userid);
    } else if (action == "draw" ) { // draw
      draw_canvas(data);
    }
    /*
    cxt.strokeStyle = '#FF0000';
    cxt.lineWidth = 2;
    cxt.beginPath();
    cxt.moveTo(x1, y1);
    cxt.lineTo(x2, y2);
    cxt.stroke();
    cxt.closePath();
    */
  };

  ws.onclose = function() { // when socket is closed, do nothing now

  };
}

function init_canvas() {
  $("#canvas").mousedown(canvas_mousedown);
  $("#canvas").mouseup(canvas_mouseup);
  $("#canvas").mousemove(canvas_mousemove);
}

/**
 * Adds a canvas between the user canvas and the mouse detection canvas
 */
function add_canvas(canvas_id) {
  $("#canvas_container").append("<canvas id=\"new_layer\" " + 
      "width=\"800\" height=\"600\"></canvas>");
  $("#new_layer").attr("id", "layer" + String(canvas_id));
}

function draw_canvas(data) {
  console.log("drawing");
}

function canvas_mousedown(e) {
  var action = {
    action: "draw",
    userid: 1,
    shape: "rect",
    start: [100, 100],
    end: [200, 200],
    fg: [255, 0, 0],
    bg: [0, 255, 0],
    width: 3,
    fill: 0
  };
  ws.send(JSON.stringify(action));
}

function canvas_mouseup(e) {
}

function canvas_mousemove(e) {
  /*
  var x_pos = e.clientX - c.offsetLeft;
  var y_pos = e.clientY - c.offsetTop;
  var pos_str = x_pos.toString() + " " + y_pos.toString();
  ws.send(pos_str);
  */
}

function login() {
  var set_name = function() {
    var name = $("#name_input").val();
    if (name != '') {
      $("#name_dialog").dialog("close");
      init_socket();
    } else {
      // do nothing
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
});
