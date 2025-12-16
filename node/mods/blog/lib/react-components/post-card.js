import React from 'react';
import { getImageUrl } from '../utils';

const PostCard = ({ app, mod, post, index, onClick, selectedUser }) => {
  let source = mod.returnImage();
  let haveImg = true;
  if (post.image) {
    source = getImageUrl(post.image);
  } else if (post.imageUrl) {
    source = post.imageUrl;
  } else {
    haveImg = false;
  }
  let date = app.browser.formatDate(post.timestamp);
  return (
    <div key={index} onClick={onClick} className="post-card">
      <div className="post-card-image">
        {' '}
        <img
          src={source}
          alt="Post preview"
          className={`preview-image ${haveImg ? '' : `profile-image-${post.publicKey}`}`}
        />
      </div>
      <div className="post-card-main">
        <div className="post-card-title">{post.title}</div>
        {selectedUser.username && (
          <div className="byline">
            Published by
            <span className="blog-author" data-publickey={post.publicKey}>
              {app.keychain.returnUsername(post.publicKey)}
            </span>
            on {date.month} {date.day}, {date.year}
          </div>
        )}
        {post.content && (
          <div className="blog-preview">{mod.extractBlogSummary(post.content, 100)}</div>
        )}
      </div>
    </div>
  );
};

export default PostCard;
