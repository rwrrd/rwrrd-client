/*global io*/
var $ = require('jquery');
var r = require('./render');
var tinycon = require('./lib/tinycon').tinycon;
var body = $('body');
var me = body.data('me');
var usersEl = $('#users');
var messagesEl = $('#messages');
var receiver = $('#receiver');
var search = $('#search');
var loading = $('.loading');
var info = $('.info');
var newMsg = $('#new');
var feed = $('#feed');
var subheader = $('.subheader');
var users = [];
var avatars = {};
var publicKeys = {};
var currentReceiver = '';
var blocker = $('.blocker');
var error = $('#error');
var publicCheck = $('#public');
var messageState = $('.message-state');
var keyName;
var idling;

var socket = io(body.data('server'));
var localSocket = io();

tinycon.setOptions({
  width: 16,
  height: 16,
  colour: '#eeeeee',
  background: '#111111',
  fallback: true
});

function setOnline(status) {
  socket.emit('notifications', {
    user: me,
    avatar: avatars[me],
    status: status
  });

  if (status === 'active') {
    clearInterval(idling);
    idling = setInterval(function () {
      setOnline('idle');
    }, 60000 * 3);
  }
}

var addUser = function (user, p) {
  $.getJSON('https://keybase.io/_/api/1.0/user/lookup.json?usernames=' +
    user + '&fields=pictures,public_keys', function (data) {
    var avatar = '/images/avatar.jpg';

    if (data.them[0].pictures) {
      avatar = data.them[0].pictures.primary.url;
    }

    publicKeys[user] = data.them[0].public_keys.primary.key_fingerprint;
    p.attr('data-pubkey', publicKeys[user]);
    avatars[user] = avatar;

    if (user === me) {
      setOnline('active');
    }
  });
};

publicCheck.on('click', function () {
  if ($(this)[0].checked) {
    messageState.removeClass('private').addClass('public');
    messageState.text('PUBLIC');
  } else {
    messageState.removeClass('public').addClass('private');
    messageState.text('PRIVATE');
  }
});

if (publicCheck[0].checked) {
  messageState.removeClass('private').addClass('public');
  messageState.text('PUBLIC');
}

$.getJSON('/users', function (data) {
  data.users.sort();
  loading.remove();
  users = data.users;
  users.unshift(me);
  users.forEach(function (user) {
    var p = $('<p><span class="notification"></span></p>');
    var span = $('<span></span>');
    p.attr('data-user', user);
    span.text(user);
    addUser(user, p);
    p.append(span);
    usersEl.append(p);
  });
});

newMsg.on('keydown', 'textarea', function (ev) {
  if (ev.keyCode === 13 && (ev.metaKey || ev.ctrlKey)) {
    newMsg.submit();
  }
});

usersEl.on('click', 'p', function () {
  feed.empty();
  setOnline('active');
  tinycon.setBubble();
  clearInterval(faviconNotify);

  var self = $(this);
  var user = $(this).data('user');
  keyName = [me, user].sort().join('-');

  receiver.val(user);
  currentReceiver = user;
  socket.emit('join', keyName);
  socket.emit('dual', {
    key: keyName,
    start: false
  });
  localSocket.emit('recent', user);
  localSocket.emit('latest-message-id', user);

  info.fadeOut(function () {
    usersEl.find('p[data-user="' + user + '"] .notification').removeClass('new');
    $('#receiver-avatar').val(avatars[user]);
    $('#receiver-pubkey').val(publicKeys[user]);
    self.siblings().removeClass('selected');
    self.addClass('selected');
    messagesEl.find('h1').text(user);
    newMsg.show();
    subheader.show();
  });
});

body.on('focus', function(){
  tinycon.setBubble();
  clearInterval(faviconNotify);
});

search.on('keyup', function (ev) {
  ev.preventDefault();
  var currKeys = $(this).val().toLowerCase();

  users.forEach(function (user) {
    if (user.indexOf(currKeys) === -1) {
      usersEl.find('p[data-user="' + user + '"]').hide();
    } else {
      usersEl.find('p[data-user="' + user + '"]').show();
    }
  });
});

newMsg.on('submit', function (ev) {
  ev.preventDefault();

  setOnline('active');

  var isPublic = false;
  if ($('input[name="public"]').is(':checked')) {
    isPublic = true;
  }

  if (!isPublic) {
    blocker.fadeIn();
  }

  $('.empty').remove();
  $('#sender-avatar').val(avatars[me]);
  console.log('posting message');
  setTimeout(function () {
    blocker.fadeOut();
    localSocket.emit('local', JSON.stringify({
      text: $('textarea[name="message"]').val(),
      receiver: $('#receiver').val(),
      senderAvatar: $('#sender-avatar').val(),
      receiverAvatar: $('#receiver-avatar').val(),
      pubKey: $('#receiver-pubkey').val(),
      public: isPublic
    }));

    newMsg.find('textarea').val('');
  }, 500);
});

localSocket.on('local', function (data) {
  r.render(data, false, currentReceiver);
});

localSocket.on('localall', function (data) {
  data.forEach(function (d) {
    r.render(d.value.message, false, currentReceiver, true);
  });
});

var faviconNotify;

socket.on('notifications', function (data) {
  if (data && currentReceiver !== data) {
    var on = true;
    faviconNotify = setInterval(function () {
      if (on) {
        tinycon.setBubble(' ');
        on = false;
      } else {
        tinycon.setBubble();
        on = true;
      }
    }, 500);
    usersEl.find('p[data-user="' + data + '"] .notification')
           .removeClass('idle').removeClass('active').addClass('new');
  }
});

socket.on('active', function (data) {
  if (users.indexOf(data.user) > -1) {
    console.log('user is online ', data.user);
    var userEl = usersEl.find('p[data-user="' + data.user + '"]');
    userEl.find('.notification').removeClass('idle').removeClass('new').addClass('active');
    if (data.user !== me) {
      userEl.detach().insertAfter(usersEl.find('p[data-user="' + me + '"]'));
    }
  }
});

socket.on('idle', function (data) {
  if (users.indexOf(data.user) > -1) {
    var userEl = usersEl.find('p[data-user="' + data.user + '"]');
    userEl.find('.notification').removeClass('active').addClass('idle');
    if (data.user !== me) {
      userEl.detach().insertAfter(usersEl.find('p[data-user="' + me + '"]'));
    }
  }
});

localSocket.on('latest-message-id', function (data) {
  console.log('since id ', data);
  socket.emit('dual', {
    key: keyName,
    start: data
  });
});

localSocket.on('err', function (data) {
  error.find('span').text(data.error);
  error.find('p').html(data.details);
  error.fadeIn();
});

error.click(function () {
  error.fadeOut();
});

socket.emit('feed');

socket.on('feed', function (data) {
  r.render(data, true);
});

socket.on('message', function (data) {
  blocker.fadeOut();

  if (data.public) {
    r.render(data, false, currentReceiver);
  }

  localSocket.emit('decrypt', data);
});
