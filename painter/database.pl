#!/usr/bin/perl

use strict;

# this uses the same id as the hashtable %clients, stores a buffer of the current line seg
our %buffers = ();

# database used to store the line drawn
our @seg_db = ();

# database used to store the chats
our @chat_db = ();

# set the user's buffer to the newest line seg
sub set_buffer {
  my ($user_id, $data) = @_;
  $buffers{$user_id} = $data;
}

# append a string to the buffer, only for drawing with a pen
sub append_to_buffer {
  my ($user_id, $data) = @_;
  # use a delimeter separate the strings
  if ($buffers{$user_id}) { # the buffer is defined
    $buffers{$user_id} .= "|".$data;
  } else { # the buffer is empty
    set_buffer($user_id, $data);
  }
}

# push the data in the buffer into the database
sub buffer2db {
  my $user_id = $_[0];
  my $buf = $buffers{$user_id};
  if ($buf) {
    $buf =~ s/\"tentative\":1/\"tentative\":0/g;
  }
  push(@seg_db, $buf);
}

# discard the data in the buffer, used when the user click the mouse
sub dump_buffer {
  my $user_id = $_[0];
  $buffers{$user_id} = 0;
}

# return the database
sub get_db {
  return @seg_db;
}

sub get_buffer {
  my $user_id = $_[0];
  return $buffers{$user_id};
}

# return all the buffers
sub get_all_buffers {
  return %buffers;
}

# insert to the chat_db
sub insert_chatdb {
  my $chat = $_[0];
  push(@chat_db, $chat);
}

# get the chat db
sub get_chatdb {
  return @chat_db;
}

# clear everything, including the seg database and the buffers
sub clear_all {
  @seg_db = ();
  foreach my $key (keys(%buffers)) {
    $buffers{$key} = "";
  }
}

1;
