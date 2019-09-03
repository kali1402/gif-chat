const SocketIO = require('socket.io');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const cookie = require('cookie-signature');

module.exports = (server, app, sessionMiddleware) => {
    const io = SocketIO(server, { path: '/socket.io' });

    app.set('io', io);
    const room = io.of('/room');
    const chat = io.of('/chat');

    io.use((socket, next) => {
        cookieParser(process.env.COOKIE_SECRET)(socket.request, socket.request.res, next)
    });
    io.use((socket, next) => {
        sessionMiddleware(socket.request, socket.request.res, next);
    });

    room.on('connection', (socket) => {
        console.log('room 네임스페이스에 접속');
        socket.on('disconnect', () => {
            console.log('room 네임스페이스 접속 해제');
        });
    });

    chat.on('connection', (socket) => {
        console.log('chat 네임스페이스에 접속');
        const req = socket.request;
        const { headers: { referer } } = req;
        const roomId = referer
        .split('/')[referer.split('/').length - 1]
        .replace(/\?.+/, '');
        socket.join(roomId);
        axios.post(`http://localhost:8005/room/${roomId}/sys`, {
            type: 'join',
            user: 'system',
            chat: `${req.session.color}님이 입장하셨습니다.`,
            number: socket.adapter.rooms[roomId].length
        }, {
            headers: {
                Cookie: `connect.sid=${'s%3A'+cookie.sign(req.signedCookies['connect.sid'], process.env.COOKIE_SECRET)}`,
            },
        });

        socket.on('disconnect', () => {
            console.log('chat 네임스페이스 접속 해제');
            socket.leave(roomId);
            const currentRoom = socket.adapter.rooms[roomId];
            const userCount = currentRoom ? currentRoom.length : 0;
            if (userCount === 0) {
                axios.delete(`http://localhost:8005/room/${roomId}`)
                .then(() => {
                    console.log('방 제거 요청 성공');
                })
                .catch((error) => {
                    console.error(error);
                });
            } else {
                axios.post(`http://localhost:8005/room/${roomId}/sys`,{
                    type:'eixt',
                    user: 'system',
                    chat: `${req.session.color}님이 퇴장하셨습니다.`,
                    number: socket.adapter.rooms[roomId].length
                }, {
                    headers: {
                        Cookie: `connect.sid=${'s%3A'+cookie.sign(req.signedCookies['connect.sid'], process.env.COOKIE_SECRET)}`,
                    },
                });
            }
        });
        socket.on('dm', (data) => {
            socket.to(data.target).emit('dm', data);
        });
        socket.on('ban', (data) => {
            socket.to(data.id).emit('ban');
        });

        // 방장 권한 위임
        socket.on('hand_over', (data) => {
            console.log('----------------data--------------------');
            console.log(data);
            
            // 해당 룸의 방장 변경.
            axios.post(`http://localhost:8005/room/${roomId}/owner`, {
                owner: data.userid
            }, {
                headers: {
                    Cookie: `connect.sid=${'s%3A'+cookie.sign(req.signedCookies['connect.sid'], process.env.COOKIE_SECRET)}`,
                },
            });

            // 방장이 변경되었다는 메세지 출력.
            axios.post(`http://localhost:8005/room/${roomId}/sys`,{
                type:'change',
                user: 'system',
                chat: `방장이 ${data.owner} => ${data.userid} 로 변경되었습니다.`,
                number: socket.adapter.rooms[roomId].length
            }, {
                headers: {
                    Cookie: `connect.sid=${'s%3A'+cookie.sign(req.signedCookies['connect.sid'], process.env.COOKIE_SECRET)}`,
                },
            });
        });
    });
};