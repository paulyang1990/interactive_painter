#!/usr/local/bin/perl

use Mojolicious::Lite;
use Mojo::JSON;

use Client;

require "database.pl";

# all the client objects are stored in a hashtable
our %clients = ();

# our $workspace_id = 0;
our $client_cnt = 0;

# forend webpage, load index.html.ep in the templetes directory
get '/index' => sub {
  my $self = shift; # $self is the current client
  $self->render(template => 'index'); # render the webpage to the client
};

# parse the contents in the database and buffers to get an array of all the line segs
sub parse_database_and_buffer {
  my @seg_db = get_db();
  my @segs = ();
  foreach my $datum (@seg_db) {
    if ($datum) {
      foreach my $seg (split(/\|/, $datum)) {
        push(@segs, $seg);
      }
    }
  }
  my %buffers = get_all_buffers();
  foreach my $key (keys(%buffers)) {
    if ($buffers{$key}) {
      foreach my $seg (split(/\|/, $buffers{$key})) {
        push(@segs, $seg);
      }
    }
  }
  return @segs;
}

# parse a buffer to get an array of the line segs
sub parse_buffer {
  my $userid = $_[0];
  my @segs = ();
  my $buffer = get_buffer($userid);
  if ($buffer) {
    foreach my $seg (split(/\|/, $buffer)) {
      push(@segs, $seg);
    }
  }
  return @segs;
}

# deal with adding new users
sub exec_new_user_req {
  my ($username, $client_id) = @_;
  my $json = Mojo::JSON->new;
  my @allids = ();
  my @allnames = ();
  foreach my $key (keys(%clients)) {
    if ($clients{$key}->get_cname() eq $username) { # username already in use
      my $data_negative = $json->encode( {
        action => "new_user",
        permission => 0,
      });
      $clients{$client_id}->get_wsclient()->send_message($data_negative); # send back msg with no permission
      my $data_invalid = $json->encode( {
        action => "new_canvas",
        userid => -1
      });
      delete $clients{$client_id};
      return "";
    }
  }
  $clients{$client_id}->set_cname($username);
  # first part: send back to the new user
  foreach my $id (keys(%clients)) {
    if ($id != $client_id) {
      push(@allids, $id);
      push(@allnames, $clients{$id}->get_cname());
    }
  }
  my @segs = parse_database_and_buffer();
  my @chats = get_chatdb();
  my $data_user = $json->encode( {
    action => "new_user",
    permission => 1,
    userid => $client_id,
    allid => \@allids,
    allname => \@allnames,
    segs => \@segs,
    chats => \@chats
  });
  $clients{$client_id}->get_wsclient()->send_message($data_user); # send all the canvases to the new user
  
  # send part: send to all the users
  my $data_canvas = $json->encode( {
    action => "new_canvas",
    userid => $client_id,
    username => $username
  });
  return $data_canvas;
}

# deals with the msg for painting, returns the msg to be sent back
sub exec_draw_req {
  my ($userid, $shape, $start, $end, $fg, $bg, $width, $fill, $tttv, $usercolor) = @_;
  my $json = Mojo::JSON->new;
  my $data = $json->encode( {
    action => "draw",
    username => $clients{$userid}->get_cname,
    userid => $userid,
    shape => $shape,
    start => $start,
    end => $end,
    fg => $fg,
    bg => $bg,
    width => $width,
    fill => $fill,
    tentative => $tttv,
    usercolor => $usercolor
  });
  if ($shape eq "pen" or $shape eq "eraser") { # drawing consecutively, push every segment into the database
    append_to_buffer($userid, $data);
  } else { # only push the last segment to the database
    set_buffer($userid, $data);
  }
  return $data;
}

# when a line segment begins
sub exec_beginseg_req {
  my ($userid, $undoed) = @_;
  my @segs_to_base = ();
  if (!$undoed) { # no undo performed
    @segs_to_base = parse_buffer($userid);
    foreach my $datum (@segs_to_base) {
      $datum =~ s/\"tentative\":1/\"tentative\":0/g;
    }
    buffer2db($userid);
  }
  dump_buffer($userid);
  my $json = Mojo::JSON->new;
  my $data = $json->encode( {
    action => "begin_seg",
    userid => $userid,
    username => $clients{$userid}->get_cname(),
    undoed => $undoed,
    segs => \@segs_to_base
  });
  return $data;
}

# when a line segment ends
sub exec_endseg_req {
  my $userid = $_[0];
  my $json = Mojo::JSON->new;
  my $data = $json->encode( {
    action => "end_seg",
    userid => $userid,
    username => $clients{$userid}->get_cname()
  });
  return $data;
}

# deals with the msg for undoing
sub exec_undo_req {
  my $userid = $_[0];
  my $json = Mojo::JSON->new;
  my $data = $json->encode( {
    action => "undo",
    userid => $userid
  });
  return $data;
}

# deals with the msg for redoing
sub exec_redo_req {
  my $userid = $_[0];
  my $json = Mojo::JSON->new;
  my @segs = parse_buffer($userid);
  my $data = $json->encode( {
    action => "redo",
    userid => $userid,
    segs => \@segs
  });
  return $data;
}

# deals with clearing the database
sub exec_clear_req {
  my $userid = $_[0];
  clear_all();
  my $json = Mojo::JSON->new;
  my $data = $json->encode( {
    action => "clear",
    userid => $userid
  });
  return $data;
}

# deals with chatting
sub exec_chat_req {
  my ($username, $time, $content, $color) = @_;
  my $json = Mojo::JSON->new;
  my $fmt_time;
  if ($time =~ /(\w+)\W(\w+)\W(\w+)\W(\w+)\W(\w+)\W(\w+)/) { # parse time into readable format
    $fmt_time = "$5:$6 $1 $2 $3 $4";
  }
  $content =~ s/\</\&lt\;/g; # escape "<" to prevent injection
  $content =~ s/fuck/\*\*\*/gi; # just for fun
  $content =~ s/64/\*\*\*/g; # just for fun
  my $data = $json->encode( {
    action => "chat",
    username => $username,
    time => $fmt_time,
    content => $content,
    color => $color
  });
  insert_chatdb($data); # into the database
  return $data;
}

# accepts a message as arg and call different methods according to the type,
# return a message that will be sent to the clients
sub exec_msg {
  my ($message, $client_id) = @_;
  my $json = Mojo::JSON->new;
  my $data = $json->decode($message);
  my $action = $data->{"action"};

  if ($action eq "new_user") { # new user request
    return exec_new_user_req(
        $data->{"username"},
        $client_id,
    );
  } elsif ($action eq "draw") { # drawing request
    return exec_draw_req(
        $data->{"userid"}, 
        $data->{"shape"}, 
        $data->{"start"}, 
        $data->{"end"}, 
        $data->{"fg"}, 
        $data->{"bg"}, 
        $data->{"width"}, 
        $data->{"fill"},
        $data->{"tentative"},
        $data->{"usercolor"}
    );
  } elsif ($action eq "begin_seg") { # starting a new seg at mouseclick
    exec_beginseg_req(
        $data->{"userid"},
        $data->{"undoed"}
    );
  } elsif ($action eq "end_seg") { # ending a seg at mouse up
    exec_endseg_req(
        $data->{"userid"}
    );
  } elsif ($action eq "undo") { # undo
    exec_undo_req(
        $data->{"userid"}
    );
  } elsif ($action eq "redo") { # redo
    exec_redo_req(
        $data->{"userid"}
    );
  } elsif ($action eq "clear") { # clear
    exec_clear_req(
        $data->{"userid"}
    );
  } elsif ($action eq "chat") { # chat
    exec_chat_req(
        $data->{"username"},
        $data->{"time"},
        $data->{"content"},
        $data->{"color"}
    );
  }
}

# send the message to the clients, does not create or modify the message
sub send_msg_to_all {
  my ($message) = @_;
  while ((my $id, my $client) = each(%clients)) { # all the clients
    $client->get_wsclient()->send_message($message);
  }
}

# when the user logs out, clear the data and send a message to all the others
sub user_logout {
  my ($client_id) = $_[0];
  my $username = $clients{$client_id}->get_cname();
  buffer2db($client_id); # push the remaining data in the buffer to the database
  dump_buffer($client_id); # clear the user's buffer
  delete $clients{$client_id};

  my $json = Mojo::JSON->new;
  my $data = $json->encode( {
    action => "user_logout",
    userid => $client_id,
    username => $username,
  });
  foreach my $id (keys(%clients)) { # all the clients
    $clients{$id}->get_wsclient()->send_message($data);
  }
}

# server side, deal with the data the client side sends
websocket '/server' => sub {
  my $self = shift; # $self is the current client

  # connection established
  my $client_id = 0;
  while (defined($clients{$client_id})) { # use the smallest id available
    $client_id++;
  }
  my $clt = new Client($self, "", $client_id);
  $clients{$client_id} = $clt;
  $client_cnt++;

  # connection closed
  $self->on_finish(sub {
    user_logout($client_id);
  });

  # The following is the server/client interface:
  # get the messages from the clients and send messages to them
  $self->on_message(sub { # when receiving a message from the client
    my ($self, $message) = @_; # get the value of the client and the message
    my $msg_back = exec_msg($message, $client_id);
    if ($msg_back) {
      send_msg_to_all($msg_back);
    }
  });
};

app->start; # start the appliction
