'use strict';

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var turnReady;

// var pcConfig = {
//   'iceServers': [{
//     'urls': 'stun:stun.l.google.com:19302'
//   }]
// };

var pcConfig = {
  iceServers: [{
    urls: '210.207.99.11:3478',
    username: 'paroma',
    password: '123'
  }]
}

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true
};

/////////////////////////////////////////////

var room = 'foo';
// Could prompt for room name:
// room = prompt('Enter room name:');

var _addr = window.location.protocol + '//' + window.location.host;
console.log(_addr)
var socket = io.connect(_addr,{
    transports: ['websocket'],
    upgrade: false,
    forceBase64 : true,
    forceNew : true,
    origins : "*",
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax : 5000,
    reconnectionAttempts: 99999
});

if (room !== '') {
    socket.emit('create or join', room);
    console.log('Attempted to create or  join room', room);
}

    socket.on('chat', function(data){
        console.log(data);
        var output = '';
        output += '<li>';
        output += '     <p>' + data.message + '</p>';
        output += '</li>';

        $(output).prependTo('#content');
    });
  
    socket.on('created', function(room) {
        console.log('Created room ' + room);
        isInitiator = true;
    });
    
    socket.on('full', function(room) {
        console.log('Room ' + room + ' is full');
    });
    
    socket.on('join', function (room){
        console.log('Another peer made a request to join room ' + room);
        console.log('This peer is the initiator of room ' + room + '!');
        isChannelReady = true;
    });
    
    socket.on('joined', function(room) {
        console.log('joined: ' + room);
        isChannelReady = true;
    });
    
    socket.on('log', function(array) {
        console.log.apply(console, array);
    });
  
  ////////////////////////////////////////////////
  
  
  function sendMessage(message) {
    console.log('Client sending message: ', message);
    socket.emit('message', message);
  }
  
  // This client receives a message
  socket.on('message', function(message) {
    console.log('Client received message:', message);
    console.log('hi message')
    if (message === 'got user media') {
        console.log('hi user')
        maybeStart();
    } else if (message.type === 'offer') {
        console.log('hi offer')
      if (!isInitiator && !isStarted) {
        maybeStart();
      }
      pc.setRemoteDescription(new RTCSessionDescription(message));
      doAnswer();
    } else if (message.type === 'answer' && isStarted) {
      pc.setRemoteDescription(new RTCSessionDescription(message));
    } else if (message.type === 'candidate' && isStarted) {
      var candidate = new RTCIceCandidate({
        sdpMLineIndex: message.label,
        candidate: message.candidate
      });
      pc.addIceCandidate(candidate);
    } else if (message === 'bye' && isStarted) {
        remoteVideo.srcObject = null;
        socket.emit('bye', room)
        handleRemoteHangup();
    }
  });
  
  ////////////////////////////////////////////////////
  
  var localVideo = document.querySelector('#localVideo');
  var remoteVideo = document.querySelector('#remoteVideo');
  
  navigator.mediaDevices.getUserMedia({
    audio: false,
    video: true
  })
  .then(gotStream)
  .catch(function(e) {
    alert('getUserMedia() error: ' + e.name);
  });
  
  function gotStream(stream) {
    console.log('Adding local stream.');
    localStream = stream;
    localVideo.srcObject = stream;
    sendMessage('got user media');
    if (isInitiator) {
      maybeStart();
    }
  }
  
  var constraints = {
    video: true
  };
  
  console.log('Getting user media with constraints', constraints);
  
  if (location.hostname !== '210.207.99.11') {
    requestTurn(
      '210.207.99.11:3478'
    );
  }
  
  function maybeStart() {
    console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
    if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
      console.log('>>>>>> creating peer connection');
      createPeerConnection();
      pc.addStream(localStream);
      isStarted = true;
      console.log('isInitiator', isInitiator);
      if (isInitiator) {
        doCall();
      }
    }
  }
  
  window.onbeforeunload = function() {
    sendMessage('bye');
  };
  
  /////////////////////////////////////////////////////////
  
  function createPeerConnection() {
    try {
      pc = new RTCPeerConnection(pcConfig);
      pc.onicecandidate = handleIceCandidate;
      pc.onaddstream = handleRemoteStreamAdded;
      pc.onremovestream = handleRemoteStreamRemoved;
      console.log(pc);
      console.log('Created RTCPeerConnnection');
    } catch (e) {
      console.log('Failed to create PeerConnection, exception: ' + e.message);
      alert('Cannot create RTCPeerConnection object.');
      return;
    }
  }
  
  function handleIceCandidate(event) {
    console.log('icecandidate event: ', event);
    if (event.candidate) {
      sendMessage({
        type: 'candidate',
        label: event.candidate.sdpMLineIndex,
        id: event.candidate.sdpMid,
        candidate: event.candidate.candidate
      });
    } else {
      console.log('End of candidates.');
    }
  }
  
  function handleCreateOfferError(event) {
    console.log('createOffer() error: ', event);
  }
  
  function doCall() {
    console.log('Sending offer to peer');
    pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
  }
  
  function doAnswer() {
    console.log('Sending answer to peer.');
    pc.createAnswer().then(
      setLocalAndSendMessage,
      onCreateSessionDescriptionError
    );
  }
  
  function setLocalAndSendMessage(sessionDescription) {
    pc.setLocalDescription(sessionDescription);
    console.log('setLocalAndSendMessage sending message', sessionDescription);
    sendMessage(sessionDescription);
  }
  
  function onCreateSessionDescriptionError(error) {
    trace('Failed to create session description: ' + error.toString());
  }
  
  function requestTurn(turnURL) {
    var turnExists = false;
    for (var i in pcConfig.iceServers) {
      if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
        turnExists = true;
        turnReady = true;
        break;
      }
    }
    if (!turnExists) {
      console.log('Getting TURN server from ', turnURL);
      // No TURN server. Get one from computeengineondemand.appspot.com:
      var xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
          var turnServer = JSON.parse(xhr.responseText);
          console.log('Got TURN server: ', turnServer);
          pcConfig.iceServers.push({
            'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
            'credential': turnServer.password
          });
          turnReady = true;
        }
      };
      xhr.open('GET', turnURL, true);
      xhr.send();
    }
  }
  
  function handleRemoteStreamAdded(event) {
    console.log('Remote stream added.');
    console.log(remoteVideo.srcObject);
    remoteStream = event.stream;
    remoteVideo.srcObject = remoteStream;
  }
  
  function handleRemoteStreamRemoved(event) {
    console.log('Remote stream removed. Event: ', event);
  }
  
  function hangup() {
    console.log('Hanging up.');
    stop();
    sendMessage('bye');
  }
  
  function handleRemoteHangup() {
    console.log('Session terminated.');
    stop();
    isInitiator = false;
  }
  
  function stop() {
    isStarted = false;
    pc.close();
    pc = null;
  }

  //////////////////////////////////////
  window.onload = function() {
    document.getElementById('button').onclick = function(){
        console.log('click')
        socket.emit('chat', {
            message : $('#message').val()
        });

    }
}