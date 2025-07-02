import os
import sys
from threading import Lock

# DON'T CHANGE THIS !!!
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from flask import Flask, send_from_directory
from flask_socketio import SocketIO, emit

app = Flask(__name__, static_folder=os.path.join(os.path.dirname(__file__), 'static'))
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "uma_chave_secreta_padrao_muito_segura")

# Configurar SocketIO
socketio = SocketIO(app, cors_allowed_origins="*")

# Variáveis globais para controlar o estado do chuveiro
shower_occupied = False
current_shower_user = None
shower_lock = Lock()

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    static_folder_path = app.static_folder
    if static_folder_path is None:
            return "Static folder not configured", 404

    if path != "" and os.path.exists(os.path.join(static_folder_path, path)):
        return send_from_directory(static_folder_path, path)
    else:
        index_path = os.path.join(static_folder_path, 'index.html')
        if os.path.exists(index_path):
            return send_from_directory(static_folder_path, 'index.html')
        else:
            return "index.html not found", 404

# Eventos SocketIO
@socketio.on('connect')
def handle_connect():
    print('Cliente conectado')
    with shower_lock:
        if shower_occupied:
            emit('shower_status', {'occupied': True, 'user_name': current_shower_user, 'message': f'O chuveiro está ocupado por {current_shower_user}'})
        else:
            emit('shower_status', {'occupied': False, 'message': 'O chuveiro está livre'})
    emit('status', {'msg': 'Conectado ao servidor'})

@socketio.on('disconnect')
def handle_disconnect():
    print('Cliente desconectado')

@socketio.on('start_shower')
def handle_start_shower(data):
    user_name = data.get('user_name', 'Usuário')
    duration = data.get('duration', 10)

    with shower_lock:
        global shower_occupied, current_shower_user
        if shower_occupied:
            emit('shower_status', {'occupied': True, 'user_name': current_shower_user, 'message': f'O chuveiro já está ocupado por {current_shower_user}. Por favor, aguarde.'})
            print(f'{user_name} tentou iniciar o chuveiro, mas está ocupado por {current_shower_user}')
        else:
            shower_occupied = True
            current_shower_user = user_name
            print(f'{user_name} iniciou o chuveiro por {duration} minutos')
            # Notificar todos os clientes conectados
            emit('shower_started', {
                'user_name': user_name,
                'duration': duration,
                'message': f'{user_name} está usando o chuveiro por {duration} minutos'
            }, broadcast=True)
            emit('shower_status', {'occupied': True, 'user_name': current_shower_user, 'message': f'O chuveiro está ocupado por {current_shower_user}'}, broadcast=True)

@socketio.on('stop_shower')
def handle_stop_shower(data):
    user_name = data.get('user_name', 'Usuário')
    with shower_lock:
        global shower_occupied, current_shower_user
        if current_shower_user == user_name:
            shower_occupied = False
            current_shower_user = None
            print(f'{user_name} parou o chuveiro')
            # Notificar todos os clientes conectados
            emit('shower_stopped', {
                'user_name': user_name,
                'message': f'{user_name} parou de usar o chuveiro'
            }, broadcast=True)
            emit('shower_status', {'occupied': False, 'message': 'O chuveiro está livre'}, broadcast=True)
        else:
            print(f'{user_name} tentou parar o chuveiro, mas não é o usuário atual.')
            emit('status', {'msg': f'Você não está usando o chuveiro no momento.'})

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)


