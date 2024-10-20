// Constants and DOM elements
const TYPING_TIMEOUT = 1000;
const messages = document.getElementById("messages");
const messageInput = document.getElementById("message");
const imageUpload = document.getElementById('image-upload');
const leaveRoomButton = document.getElementById("leave-room-btn");
const username = document.getElementById("username").value;
const NOTIFICATION_TIMEOUT = 5000; // 5 seconds
const unreadMessages = new Set();

// State variables
let replyingTo = null;
let isUserListVisible = false;
let typingTimeout;
let currentUser = null;
let typingUsers = new Set();
let notificationPermission = 'default';
let notificationTimeout;
let lastReadMessageId = null;
let isTabActive = true;
let unreadCount = 0;
const originalTitle = document.title;

//Local Storage
const LS_KEYS = {
  UNREAD_COUNT: 'unreadCount',
  LAST_READ_MESSAGE_ID: 'lastReadMessageId',
  NOTIFICATION_PERMISSION: 'notificationPermission',
  USERNAME: 'username',
};

var socketio = io({
  transports: ['websocket']  // Ensure only WebSocket is used
});

// Helper functions
const createTypingIndicator = () => {
  const typingIndicator = document.createElement("div");
  typingIndicator.className = "typing-indicator";
  typingIndicator.style.display = "none";
  messages.parentNode.insertBefore(typingIndicator, messages.nextSibling);
  return typingIndicator;
};

const updatePageTitle = () => {
  if (unreadCount > 0) {
    document.title = `(${unreadCount}) ${originalTitle}`;
  } else {
    document.title = originalTitle;
  }
  updateLocalStorage(LS_KEYS.UNREAD_COUNT, unreadCount.toString());
};

const handleVisibilityChange = () => {
  if (document.hidden) {
    isTabActive = false;
  } else {
    isTabActive = true;
    if (unreadCount > 0) {
      markMessagesAsRead();
      unreadCount = 0;
      updatePageTitle();
    }
  }
};

// Load data from Local Storage
const loadFromLocalStorage = () => {
  unreadCount = parseInt(localStorage.getItem(LS_KEYS.UNREAD_COUNT) || '0');
  lastReadMessageId = localStorage.getItem(LS_KEYS.LAST_READ_MESSAGE_ID);
  notificationPermission = localStorage.getItem(LS_KEYS.NOTIFICATION_PERMISSION) || 'default';
  currentUser = localStorage.getItem(LS_KEYS.USERNAME) || username;

  updatePageTitle();
};

// Save data to Local Storage
const saveToLocalStorage = () => {
  localStorage.setItem(LS_KEYS.UNREAD_COUNT, unreadCount.toString());
  localStorage.setItem(LS_KEYS.LAST_READ_MESSAGE_ID, lastReadMessageId);
  localStorage.setItem(LS_KEYS.NOTIFICATION_PERMISSION, notificationPermission);
  localStorage.setItem(LS_KEYS.USERNAME, currentUser);
};

// Update specific items in Local Storage
const updateLocalStorage = (key, value) => {
  localStorage.setItem(key, value);
};

document.addEventListener("visibilitychange", handleVisibilityChange);

const typingIndicator = createTypingIndicator();

const createMessageElement = (name, msg, image, messageId, replyTo) => {
  const isCurrentUser = name === currentUser;

  const element = document.createElement("div");
  element.className = `message flex ${isCurrentUser ? 'justify-end' : 'justify-start'} items-start space-x-2`;

  if (!isCurrentUser) {
    const profilePhotoContainer = document.createElement("div");
    profilePhotoContainer.className = "flex-shrink-0";
    const profilePhoto = document.createElement("img");
    profilePhoto.src = `/profile_photos/${name}`;
    profilePhoto.alt = `${name}'s profile`;
    profilePhoto.className = "w-8 h-8 rounded-full object-cover";
    profilePhoto.onerror = function() {
      this.src = '/static/images/default-profile.png';
    };
    profilePhotoContainer.appendChild(profilePhoto);
    element.appendChild(profilePhotoContainer);
  }

  const messageBubble = document.createElement("div");
  messageBubble.className = `group relative p-3 rounded-2xl shadow-sm max-w-[85%] md:max-w-[70%] transition-shadow duration-200 ${isCurrentUser ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'}`;
  messageBubble.dataset.messageId = messageId;

  // Message content
  const messageContent = document.createElement("div");
  messageContent.className = "message-content leading-relaxed break-words";
  messageContent.textContent = msg || "Sent an image";
  messageBubble.appendChild(messageContent);

  // Reply information
  if (replyTo) {
    const replyInfo = document.createElement("div");
    replyInfo.className = `reply-info mt-2 text-sm ${isCurrentUser ? 'text-white/75' : 'text-gray-500 dark:text-gray-400'} pl-3 border-l-2 border-current`;
    replyInfo.dataset.replyTo = replyTo.id;
    replyInfo.innerHTML = `Replying to: <span class="replied-message italic">${replyTo.message}</span>`;
    messageBubble.appendChild(replyInfo);
  }

  // Image
  if (image) {
    const img = document.createElement("img");
    img.src = image;
    img.alt = "Uploaded image";
    img.className = "mt-2 max-w-full rounded-lg";
    messageBubble.appendChild(img);
  }

  // Actions menu
  const actionsMenu = createActionsMenu(isCurrentUser);
  messageBubble.appendChild(actionsMenu);

  element.appendChild(messageBubble);

  // Add event listeners
  addEventListeners(messageBubble, messageId, msg);

  return element;
};

const createActionsMenu = (isCurrentUser) => {
  const actionsMenu = document.createElement("div");
  actionsMenu.className = `actions-menu opacity-0 group-hover:opacity-100 absolute -top-8 ${isCurrentUser ? 'right-0' : 'left-0'} 
    flex items-center space-x-2 bg-white dark:bg-gray-800 shadow-lg rounded-lg px-2 py-1 transition-opacity duration-200 z-10`;

  const actions = [
    { title: "Reply", icon: "M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" },
    { title: "Edit", icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z", onlyCurrentUser: true },
    { title: "Delete", icon: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16", onlyCurrentUser: true, color: "text-red-600" }
  ];

  actions.forEach(action => {
    if (!action.onlyCurrentUser || (action.onlyCurrentUser && isCurrentUser)) {
      const button = document.createElement("button");
      button.className = `${action.title.toLowerCase()}-btn hover:bg-gray-100 dark:hover:bg-gray-600 p-1.5 rounded transition-colors duration-150`;
      button.title = action.title;
      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 ${action.color || 'text-gray-600 dark:text-gray-300'}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${action.icon}" />
        </svg>
      `;
      actionsMenu.appendChild(button);
    }
  });

  return actionsMenu;
};

const addEventListeners = (messageBubble, messageId, msg) => {
  const replyBtn = messageBubble.querySelector('button[title="Reply"]');
  const editBtn = messageBubble.querySelector('button[title="Edit"]');
  const deleteBtn = messageBubble.querySelector('button[title="Delete"]');

  if (replyBtn) {
    replyBtn.addEventListener('click', () => startReply(messageId, msg));
  }

  if (editBtn) {
    editBtn.addEventListener('click', () => editMessage(messageId));
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => deleteMessage(messageId));
  }
};

const addMessageToDOM = (element) => {
  let messageContainer = messages.querySelector('.flex.flex-col');
  if (!messageContainer) {
    messageContainer = document.createElement('div');
    messageContainer.className = 'flex flex-col space-y-4 p-4';
    messages.appendChild(messageContainer);
  }
  
  messageContainer.appendChild(element);
  messages.scrollTop = messages.scrollHeight;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const messageId = entry.target.getAttribute('data-message-id');
        if (unreadMessages.has(messageId)) {
          markMessagesAsRead();
        }
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 1.0 });

  observer.observe(element);
};

const scrollToMessage = (messageId) => {
  const targetMessage = document.querySelector(`[data-message-id="${messageId}"]`);
  if (targetMessage) {
    targetMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetMessage.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';
    setTimeout(() => {
      targetMessage.style.backgroundColor = '';
    }, 2000);
  }
};

const startReply = (messageId, message) => {
  replyingTo = { id: messageId, message: message };
  messageInput.placeholder = `Replying to: ${message}`;
  messageInput.classList.add('replying');
  messageInput.focus();
};

const cancelReply = () => {
  replyingTo = null;
  messageInput.placeholder = "Type a message...";
  messageInput.classList.remove('replying');
};

const addReaction = (messageId, emoji) => {
  socketio.emit('add_reaction', { messageId, emoji });
};

socketio.on('update_reactions', (data) => {
  updateReactions(data.messageId, data.reactions);
});

const editMessage = (messageId) => {
  const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
  const messageContent = messageElement.querySelector('.message-content');
  const currentText = messageContent.textContent;
  const isCurrentUser = messageElement.classList.contains('bg-indigo-600');

  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentText;
  input.className = `rounded-md p-1 w-full ${
    isCurrentUser 
      ? 'bg-indigo-700 text-white placeholder-indigo-300 border border-indigo-400' 
      : 'bg-white text-gray-900 border border-gray-300'
  }`;
  
  messageContent.replaceWith(input);
  input.focus();

  const handleEdit = (event) => {
    if (event.key === 'Enter' || event.type === 'blur') {
      const newText = input.value.trim();
      if (newText !== '' && newText !== currentText) {
        socketio.emit('edit_message', { messageId, newText });
      }
      finishEdit(newText, isCurrentUser);
    } else if (event.key === 'Escape') {
      finishEdit(currentText, isCurrentUser);
    }
  };

  const finishEdit = (newText, isCurrentUser) => {
    input.removeEventListener('keyup', handleEdit);
    input.removeEventListener('blur', handleEdit);

    const newMessageContent = document.createElement('div');
    newMessageContent.className = `message-content ${isCurrentUser ? 'text-white' : 'text-gray-900'}`;
    newMessageContent.textContent = newText;
    
    input.replaceWith(newMessageContent);
  };

  input.addEventListener('keyup', handleEdit);
  input.addEventListener('blur', handleEdit);
};

const updateTypingIndicator = () => {
  const typingArray = Array.from(typingUsers);
  let typingText = '';

  if (typingArray.length === 1) {
    typingText = `${typingArray[0]} is typing...`;
  } else if (typingArray.length === 2) {
    typingText = `${typingArray[0]} and ${typingArray[1]} are typing...`;
  } else if (typingArray.length > 2) {
    typingText = `${typingArray[0]}, ${typingArray[1]}, and ${typingArray.length - 2} more are typing...`;
  }

  typingIndicator.textContent = typingText;
  typingIndicator.style.display = typingArray.length > 0 ? "block" : "none";
};

const deleteMessage = (messageId) => {
    if (confirm('Are you sure you want to delete this message?')) {
      socketio.emit('delete_message', { messageId });
    }
  };

const sendMessage = () => {
  const message = messageInput.value.trim();
  if (message === "") return;
  
  const messageData = { 
    data: message,
    replyTo: replyingTo
  };
  socketio.emit("message", messageData);
};

const leaveRoom = () => {
  const homeUrl = leaveRoomButton.getAttribute("data-home-url");
  window.location.href = homeUrl;
};

socketio.on("message_rejected", (data) => {
  alert(`Your message was not sent: ${data.reason}`);
});

// Event listeners
messageInput.addEventListener("keyup", (event) => {
  if (event.key === "Enter") {
    sendMessage();
  } else {
    socketio.emit("typing", { isTyping: true });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socketio.emit("typing", { isTyping: false });
    }, TYPING_TIMEOUT);
  }
});

imageUpload.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      socketio.emit("message", { data: "Sent an image", image: e.target.result });
    };
    reader.readAsDataURL(file);
  }
});

const handleReaction = (emoji, reactionsContainer) => {
  const existingReaction = reactionsContainer.querySelector(`span[data-emoji="${emoji}"]`);
  
  if (existingReaction) {
    let count = parseInt(existingReaction.getAttribute('data-count'));
    existingReaction.setAttribute('data-count', ++count);
    existingReaction.textContent = `${emoji} ${count}`;
  } else {
    const newReaction = document.createElement('span');
    newReaction.className = 'reaction';
    newReaction.setAttribute('data-emoji', emoji);
    newReaction.setAttribute('data-count', 1);
    newReaction.textContent = `${emoji} 1`;
    reactionsContainer.appendChild(newReaction);
  }
};

leaveRoomButton.addEventListener("click", leaveRoom);

const requestNotificationPermission = () => {
  if (!("Notification" in window)) {
    console.log("This browser does not support desktop notification");
  } else {
    Notification.requestPermission().then((permission) => {
      notificationPermission = permission;
      updateLocalStorage(LS_KEYS.NOTIFICATION_PERMISSION, notificationPermission);
      if (permission === "granted") {
        console.log("Notification permission granted");
      }
    });
  }
};

const showNotification = (title, body) => {
  if (notificationPermission === 'granted' && !isTabActive) {
    const notification = new Notification(title, {
      body: body,
      icon: '/static/images/chat-icon.png'
    });

    clearTimeout(notificationTimeout);
    notificationTimeout = setTimeout(() => notification.close(), NOTIFICATION_TIMEOUT);

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }
};

const markMessagesAsRead = () => {
  if (isTabActive && unreadMessages.size > 0) {
    const messageIds = Array.from(unreadMessages);
    socketio.emit("mark_messages_read", { message_ids: messageIds });
    unreadMessages.clear();
    unreadCount = 0;
    updatePageTitle();
    lastReadMessageId = messageIds[messageIds.length - 1];
    updateLocalStorage(LS_KEYS.LAST_READ_MESSAGE_ID, lastReadMessageId);
  }
};

socketio.on("message", (data) => {
  const messageElement = createMessageElement(
    data.name, 
    data.message, 
    data.image, 
    data.id, 
    data.reply_to
  );
  addMessageToDOM(messageElement);

  if (data.name !== currentUser) {
    unreadMessages.add(data.id);
    if (isTabActive) {
      markMessagesAsRead();
    } else {
      unreadCount++;
      updatePageTitle();
      showNotification(`New message from ${data.name}`, data.message || "New image message");
    }
  }

  const replyInfo = messageElement.querySelector('.reply-info');
  if (replyInfo) {
    replyInfo.addEventListener('click', () => scrollToMessage(replyInfo.getAttribute('data-reply-to')));
  }

  if (data.name === currentUser) {
    messageInput.value = "";
    cancelReply();

    const editBtn = messageElement.querySelector('.edit-btn');
    const deleteBtn = messageElement.querySelector('.delete-btn');
    editBtn.addEventListener('click', () => editMessage(data.id));
    deleteBtn.addEventListener('click', () => deleteMessage(data.id));
  } else {
    const replyBtn = messageElement.querySelector('.reply-btn');
    replyBtn.addEventListener('click', () => startReply(data.id, data.message));
  }
});

socketio.on("messages_read", (data) => {
  const { reader, message_ids } = data;
  message_ids.forEach(id => {
    const messageElement = document.querySelector(`[data-message-id="${id}"]`);
    if (messageElement && reader !== currentUser) {
      messageElement.style.backgroundColor = '#c084fc'; // Purple color
    }
  });
});

socketio.on("chat_history", (data) => {
  messages.scrollTop = messages.scrollHeight;
  const messageContainer = document.createElement('div');
  messageContainer.className = 'flex flex-col space-y-4 p-4';
  
  data.messages.forEach((message) => {
    const messageElement = createMessageElement(
      message.name, 
      message.message, 
      message.image, 
      message.id, 
      message.reply_to
    );
    messageContainer.appendChild(messageElement);

    if (message.name !== currentUser && !message.read_by.includes(currentUser)) {
      unreadMessages.add(message.id);
    }

    // Only highlight the current user's messages that have been read by others
    if (message.name === currentUser && message.read_by.some(reader => reader !== currentUser)) {
      messageElement.querySelector('.message-content').parentElement.style.backgroundColor = '#c084fc'; // Purple color
    }
  });
  
  messages.innerHTML = '';
  messages.appendChild(messageContainer);
  markMessagesAsRead();
});

socketio.on("edit_message", (data) => {
  const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
  if (messageElement) {
    const messageContent = messageElement.querySelector('.message-content');
    const isCurrentUser = messageElement.classList.contains('bg-indigo-600');
    messageContent.className = `message-content ${isCurrentUser ? 'text-white' : 'text-gray-900'}`;
    messageContent.textContent = data.newText;
  }
});
  
socketio.on("delete_message", (data) => {
  const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
  if (messageElement) {
    messageElement.remove();
  }
});

socketio.on("typing", (data) => {
  if (data.isTyping) {
    typingUsers.add(data.name);
  } else {
    typingUsers.delete(data.name);
  }
  updateTypingIndicator();
});

socketio.on("connect", () => {
  console.log("Connected to server");
  currentUser = username;
  requestNotificationPermission();
});

socketio.on("disconnect", () => {
  console.log("Disconnected from server");
});

document.querySelector('.user-toggle-btn').addEventListener('click', () => {
  const userList = document.getElementById('user-list');
  const userCountLabel = document.getElementById('user-count-label');
  
  if (isUserListVisible) {
    userList.classList.add('hidden');
    userCountLabel.classList.remove('hidden');
  } else {
    userList.classList.remove('hidden');
    userCountLabel.classList.add('hidden');
  }
  
  isUserListVisible = !isUserListVisible;
});

socketio.on("update_users", (data) => {
  const userList = document.getElementById("user-list");
  
  userList.innerHTML = `
    <span class="user-list-label text-white font-semibold hidden md:inline">Users in room:</span>
  `;
  
  data.users.forEach(user => {
    const userBadge = document.createElement("div");
    userBadge.className = "user-badge flex items-center gap-1.5 bg-white px-3 py-1 rounded-full shadow-sm group hover:bg-gray-100 transition";
    
    const userNameSpan = document.createElement("span");
    userNameSpan.className = "truncate max-w-[100px] text-gray-800";
    userNameSpan.textContent = user.username;

    const statusIndicator = document.createElement("span");
    if (user.online) {
      statusIndicator.innerHTML = '<span class="text-green-400">🟢</span>';
    } else {
      statusIndicator.innerHTML = '<span class="text-gray-400">⚫</span>';
    }

    if (user.isFriend) {
      const friendStar = document.createElement("span");
      friendStar.className = "friend-star text-yellow-300";
      friendStar.textContent = '★';
      userBadge.appendChild(friendStar);
    }

    userBadge.appendChild(userNameSpan);
    userBadge.appendChild(statusIndicator);

    userList.appendChild(userBadge);
  });
});

// Call loadFromLocalStorage when the page loads
document.addEventListener('DOMContentLoaded', loadFromLocalStorage);

// Call saveToLocalStorage before the page unloads
window.addEventListener('beforeunload', saveToLocalStorage);