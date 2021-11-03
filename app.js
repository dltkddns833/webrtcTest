var http = require('http');
var express = require('express');
var os = require('os');
var fs = require('fs');
var socketIO = require('socket.io');
var nodeStatic = require('node-static');
var fileServer = new(nodeStatic.Server)();
var logger = require('morgan')

var configs = {
    port : 8000
}

const hostname = '210.207.99.11';

// 서버 생성
var app = express();


// 미들웨어 설정
app.use(express.static(__dirname + '/public'));
app.use(logger)

// 웹서버 생성
var server = http.createServer(app).listen(configs.port, hostname, function() {
    console.log("Sever Running!");
})

app.get('/', function(req,res){
    fs.readFile('./index.html', 'utf8' ,function(err, data){
        if(err){ console.log(err) }
        else{
            res.writeHead(200, {'Content-Type' : 'text/html'});
            res.end(data);
        }
    })
})

// 소켓 서버 설정
var io = socketIO.listen(server);

var roomlist = [];

io.sockets.on('connection', function(socket) {

    // convenience function to log server messages on the client
    function log() {
        var array = ['Message from server:'];
        array.push.apply(array, arguments);
        socket.emit('log', array);
    }

    socket.on('chat', function(data){
        io.to('foo').emit('chat',data);
    })
  
    socket.on('message', function(message) {
        log('Client said: ', message);
        // for a real app, would be room-only (not broadcast)
        // socket.broadcast.emit('message', message);
        socket.broadcast.emit('message', message);
    });
  
    socket.on('create or join', function(room) {
        log('Received request to create or join room ' + room);
  
        // var clientsInRoom = io.nsps['/'].adapter.rooms[room];
        // var numClients = clientsInRoom ? clientsInRoom.length : 0;

        var clientsInRoom = io.sockets.adapter.rooms[room];
        var numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
        console.log('Room ' + room + ' now has ' + numClients + ' client(s)');
    
        log(roomlist)
        if (numClients === 0) {
            socket.join(room);
            log('Client ID ' + socket.id + ' created room ' + room);
            roomlist.push(room);
            socket.emit('created', room, socket.id);
                
        } else if (numClients <= 15) {
            log('Client ID ' + socket.id + ' joined room ' + room);
            socket.join(room);
            io.sockets.in(room).emit('join', room);
            socket.emit('joined', room, socket.id);
            io.sockets.in(room).emit('ready');
        } else { // max two clients
            socket.emit('full', room);
        }
    });
  
    socket.on('ipaddr', function() {
        var ifaces = os.networkInterfaces();
        for (var dev in ifaces) {
            ifaces[dev].forEach(function(details) {
            if (details.family === 'IPv4' && details.address !== '222.237.77.172') {
                socket.emit('ipaddr', details.address);
            }
            });
        }
    });
  
    socket.on('bye', function(room){
        var index = roomlist.indexOf(room);
        if(index > -1){
            roomlist.splice(index, 1);
        }
        console.log('received bye');
    });

    socket.on('disconnect', function(data){
        log(data);
    })

    socket.on('reconnect', function(room){
        console.log('reconnect')
        socket.join(roomlist[0])
    })


});

