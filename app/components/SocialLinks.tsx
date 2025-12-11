'use client'

export default function SocialLinks() {
  const socialLinks = [
    { name: 'Instagram', url: 'https://www.instagram.com/alba.rarixx/' },
    { name: 'TikTok', url: 'https://www.tiktok.com/@alba.rarixx' },
    { name: 'YouTube', url: 'https://www.youtube.com/@Alba.Rarixx' },
    { name: 'MUSIC', url: 'https://artists.landr.com/ITCH' },
  ]

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-black border-t border-white/10 z-30">
      <div className="container mx-auto px-6 md:px-8 py-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          {/* Copyright */}
          <div className="flex flex-wrap justify-center md:justify-start items-center gap-4 text-xs md:text-sm text-gray-400">
            <span>© Alba Rari</span>
          </div>
          
          {/* Social Links */}
          <div className="flex justify-center items-center gap-6 flex-wrap">
            {socialLinks.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:text-gray-400 transition-colors text-sm uppercase tracking-wider"
                aria-label={link.name}
              >
                {link.name}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}

