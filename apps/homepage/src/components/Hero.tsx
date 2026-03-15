import { motion, Variants } from "framer-motion";

export function HeroBackground() {
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 100, damping: 20 },
    },
  };

  return (
    <section
      className="absolute inset-0 flex flex-col items-center justify-center px-6 md:px-12 pointer-events-none overflow-hidden"
    >
      {/* HUD Frame Elements */}
      <div className="absolute top-12 left-12 w-6 h-6 border-t-2 border-l-2 border-white/20"></div>
      <div className="absolute top-12 right-12 w-6 h-6 border-t-2 border-r-2 border-white/20"></div>
      <div className="absolute bottom-12 left-12 w-6 h-6 border-b-2 border-l-2 border-white/20"></div>
      <div className="absolute bottom-12 right-12 w-6 h-6 border-b-2 border-r-2 border-white/20"></div>

      {/* Crosshairs & Grid Lines */}
      <div className="absolute top-0 bottom-0 left-[20%] w-[1px] bg-white/[0.03]"></div>
      <div className="absolute top-0 bottom-0 right-[20%] w-[1px] bg-white/[0.03]"></div>
      <div className="absolute top-[30%] left-0 right-0 h-[1px] bg-white/[0.03]"></div>

      {/* Central Editorial Content */}
      <motion.div
        className="relative z-10 w-full h-full flex flex-col items-center justify-center text-center"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants} className="absolute top-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
          <div className="inline-flex items-center gap-3 px-4 py-1.5 border border-white/10 text-xs font-mono tracking-[0.2em] text-white/50 bg-black/50 backdrop-blur-md">
            <span className="w-1.5 h-1.5 bg-brand animate-pulse"></span>
            <span>SYS.MILADY_APP_V1.0</span>
          </div>
          <div className="inline-flex items-center px-3 py-1 bg-brand/10 border border-brand/20 text-[10px] font-mono tracking-[0.2em] text-brand rounded backdrop-blur-md uppercase">
            Powered by @ElizaOS
          </div>
        </motion.div>

        {/* Massive clipping typography - Background Layer */}
        {/* Restore white/yellow color scheme and solid readability */}
        <motion.h1
          variants={itemVariants}
          className="text-[12vw] sm:text-[14vw] lg:text-[16vw] font-black leading-[0.8] tracking-tighter uppercase text-white/95 flex flex-col items-center pointer-events-none select-none mt-12"
        >
          <span>AGENTIC</span>
          <span className="text-brand drop-shadow-lg">CORE</span>
        </motion.h1>
      </motion.div>
    </section>
  );
}

export function HeroForeground() {
  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 100, damping: 20 },
    },
  };

  return (
    <section className="absolute inset-0 flex flex-col items-center justify-end px-6 md:px-12 pointer-events-none overflow-hidden pb-32">
      <motion.div
        className="relative z-10 w-full flex flex-col items-center translate-y-8"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.15, delayChildren: 0.6 } }
        }}
      >

        <motion.div variants={itemVariants} className="w-full max-w-2xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-3 pointer-events-auto">
          {/* CTA buttons - Hardcore Flat Minimalist */}
          <button className="group relative flex items-center justify-center gap-2 bg-brand text-dark border border-brand hover:bg-white hover:border-white px-4 py-3 transition-colors duration-300 font-mono text-[10px] uppercase tracking-widest font-bold">
            <AppleIcon />
            <div className="flex flex-col items-start">
              <span>macOS</span>
              <span className="text-[8px] opacity-60 font-medium tracking-widest mt-0.5">SOON</span>
            </div>
          </button>

          <button className="group relative flex items-center justify-center gap-2 bg-black/80 backdrop-blur-md text-white border border-white/20 hover:bg-white hover:text-dark px-4 py-3 transition-colors duration-300 font-mono text-[10px] uppercase tracking-widest font-bold">
            <WindowsIcon />
            <div className="flex flex-col items-start">
              <span>Windows</span>
              <span className="text-[8px] opacity-60 font-medium tracking-widest mt-0.5">SOON</span>
            </div>
          </button>

          <button className="group relative flex items-center justify-center gap-2 bg-black/80 backdrop-blur-md text-white border border-white/20 hover:bg-white hover:text-dark px-4 py-3 transition-colors duration-300 font-mono text-[10px] uppercase tracking-widest font-bold">
            <AppleIcon />
            <div className="flex flex-col items-start">
              <span>iOS</span>
              <span className="text-[8px] opacity-60 font-medium tracking-widest mt-0.5">SOON</span>
            </div>
          </button>

          <button className="group relative flex items-center justify-center gap-2 bg-black/80 backdrop-blur-md text-white border border-white/20 hover:bg-white hover:text-dark px-4 py-3 transition-colors duration-300 font-mono text-[10px] uppercase tracking-widest font-bold">
            <AndroidIcon />
            <div className="flex flex-col items-start">
              <span>Android</span>
              <span className="text-[8px] opacity-60 font-medium tracking-widest mt-0.5">SOON</span>
            </div>
          </button>

          <button className="group relative flex items-center justify-center gap-2 bg-black/80 backdrop-blur-md text-white border border-white/20 hover:bg-white hover:text-dark px-4 py-3 transition-colors duration-300 font-mono text-[10px] uppercase tracking-widest font-bold col-span-2 md:col-span-1">
            <LinuxIcon />
            <div className="flex flex-col items-start">
              <span>Linux</span>
              <span className="text-[8px] opacity-60 font-medium tracking-widest mt-0.5">SOON</span>
            </div>
          </button>
        </motion.div>

      </motion.div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 text-white/30 font-mono text-[10px] tracking-widest uppercase pointer-events-auto"
      >
        <span>INITIALIZING SEQUENCE</span>
        <div className="w-[1px] h-8 bg-gradient-to-b from-white/30 to-transparent"></div>
      </motion.div>

    </section>
  );
}

export function AppleIcon() {
  return (
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

export function WindowsIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 12V6.5l8-1.1V12H3zm0 .5h8v6.6l-8-1.1V12.5zM11.5 12V5.3l9.5-1.3V12h-9.5zm0 .5H21v7.8l-9.5-1.3v-6.5z" />
    </svg>
  );
}

export function AndroidIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48C13.85 1.23 12.95 1 12 1c-.96 0-1.86.23-2.66.63L7.85.15c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31C6.97 3.26 6 5.01 6 7h12c0-1.99-.97-3.75-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z" />
    </svg>
  );
}

export function LinuxIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.396 1.884 1.564.422.074.852-.002 1.278-.29.19-.13.363-.295.528-.525.39-.546.981-1.3 1.006-2.34.034-.46-.04-.87-.233-1.27a2.002 2.002 0 00-.13-.262c.009-.02.018-.042.027-.064.135-.327.191-.672.186-1.004-.01-.667-.311-1.321-.656-1.862-.388-.567-.852-1.079-1.186-1.625-.334-.546-.514-1.134-.394-1.893.202-1.283.545-2.57.353-3.822-.116-.752-.398-1.493-.876-2.104-.46-.588-1.093-1.037-1.86-1.211-.454-.103-.943-.127-1.464-.074-.511.054-1.052.176-1.622.367zm-.034 1.024c.545-.19 1.061-.3 1.53-.348.466-.05.896-.025 1.275.064.602.142 1.088.488 1.45.944.364.458.597 1.063.694 1.695.169 1.095-.142 2.376-.34 3.634-.142.916.06 1.717.496 2.416.436.7.97 1.263 1.37 1.838.2.287.365.576.477.857.112.28.168.546.174.803.003.17-.016.334-.064.483-.048.148-.11.26-.2.33-.093.072-.177.104-.262.132a.42.42 0 01-.351-.06 1.25 1.25 0 01-.254-.237 6.64 6.64 0 01-.253-.332c-.201-.273-.451-.621-.65-.878a1.53 1.53 0 00-.287-.285.666.666 0 00-.422-.13.66.66 0 00-.387.152c-.137.107-.245.265-.33.439-.157.355-.216.81-.03 1.177.067.133.151.239.256.328-.262.397-.47.808-.609 1.253-.14.448-.214.93-.177 1.453.025.348.094.677.2.987-.009.003-.018.006-.028.01-.502.211-1.122.385-1.86.385-.62 0-1.3-.107-2.069-.357a8.156 8.156 0 01-.807-.357c.04-.238.08-.484.105-.742.064-.648.053-1.345-.123-1.902-.088-.278-.232-.538-.432-.736-.2-.199-.471-.325-.776-.351-.4-.033-.771.126-1.073.365-.302.24-.547.554-.759.858-.118.168-.215.326-.337.508a4.115 4.115 0 01-.186-.087c-.403-.217-.78-.487-1.202-.596-.422-.11-.916-.103-1.378.2-.231.151-.422.369-.545.64-.123.27-.182.57-.182.899 0 .329.054.652.14.949.044.147.078.244.128.398l-.125.064c-.19.098-.375.199-.531.347-.156.149-.279.36-.279.594 0 .234.063.401.149.541.094.14.2.254.329.362a4.21 4.21 0 00.87.522c.34.163.723.29 1.134.375.254.053.433.155.594.28.16.124.297.27.411.428.226.316.375.689.464 1.087.09.4.103.834.036 1.283a5.006 5.006 0 01-.088.433c-.107.017-.225.02-.343.012-.556-.032-1.264-.29-1.914-.537-.325-.125-.633-.258-.898-.376a2.09 2.09 0 01-.626-.426c-.147-.159-.249-.381-.206-.683.037-.259.14-.492.28-.697.14-.206.308-.385.438-.544.138-.167.26-.3.327-.413.034-.058.057-.11.069-.165a.3.3 0 00-.01-.166.304.304 0 00-.202-.183.356.356 0 00-.239.012 1.023 1.023 0 00-.244.143 3.276 3.276 0 00-.472.42c-.213.226-.425.508-.574.82a2.08 2.08 0 00-.227.993c.008.366.148.723.374.98.226.257.51.427.787.547.556.242 1.096.377 1.614.514.518.136 1.006.267 1.427.457.279.127.517.274.705.446.187.172.32.372.373.611.054.239.019.523-.124.862-.063.15-.161.328-.328.527-.167.2-.404.42-.725.617a.48.48 0 01-.126.048c-.312.073-.72.074-1.274-.205-.554-.28-1.227-.77-2.14-1.241-.913-.472-2.032-.574-2.768-.755-.368-.091-.646-.205-.82-.37-.176-.165-.266-.396-.14-.768.07-.213.027-.54-.04-.948-.068-.408-.16-.826-.138-1.215.025-.397.175-.766.545-1.005.092-.057.23-.086.358-.154.128-.067.258-.146.344-.276.085-.129.114-.296.077-.488-.037-.192-.11-.398-.17-.607-.062-.208-.137-.424-.168-.631-.032-.208-.02-.406.069-.56.045-.077.119-.136.232-.17.113-.034.264-.044.47-.015l.006.001c.29.039.558.131.827.222.268.091.534.182.815.225.281.042.586.033.878-.115.148-.075.28-.188.373-.35.092-.161.138-.373.08-.632-.057-.255-.198-.477-.39-.661-.192-.184-.423-.328-.673-.456a5.63 5.63 0 00-.914-.36 17.078 17.078 0 01-.572-.186c-.162-.058-.305-.12-.42-.203a.762.762 0 01-.245-.27.586.586 0 01-.063-.344c.014-.108.066-.216.155-.31.09-.094.207-.172.347-.234.281-.124.637-.184 1.002-.184.365 0 .722.06.983.142l.013.004a.567.567 0 00.163.035.465.465 0 00.312-.103.44.44 0 00.153-.262.456.456 0 00-.049-.303.575.575 0 00-.256-.214 3.063 3.063 0 00-.448-.169 5.327 5.327 0 00-1.28-.197 3.652 3.652 0 00-1.323.185 1.86 1.86 0 00-.675.412 1.206 1.206 0 00-.339.675 1.096 1.096 0 00.118.651c.107.2.266.357.45.482.369.251.846.395 1.336.547l.027.008c.226.068.45.145.656.245.206.1.393.221.533.377.14.156.224.352.242.582a.9.9 0 01-.115.548c-.048.082-.146.122-.288.102a2.512 2.512 0 01-.404-.1 4.25 4.25 0 00-.58-.147c-.293-.046-.59-.045-.852.083a.853.853 0 00-.367.335c-.106.178-.148.392-.148.621 0 .23.043.464.104.688.06.225.148.454.208.654.03.1.049.188.054.26a.137.137 0 01-.009.082 1.12 1.12 0 01-.1.098c-.074.068-.17.14-.284.222a5.035 5.035 0 01-.358.227c-.08.045-.102.051-.109.049a.463.463 0 01-.082-.097c-.073-.122-.138-.297-.172-.514-.034-.217-.04-.472.04-.773.041-.155.065-.25.07-.399a1.164 1.164 0 00-.082-.497.934.934 0 00-.308-.397.89.89 0 00-.505-.173c-.21-.007-.398.066-.56.172a2.2 2.2 0 00-.413.36c-.13.142-.243.287-.37.438-.126.152-.267.299-.459.422a.822.822 0 01-.124.067c-.015-.108-.017-.238 0-.394.044-.394.175-.867.357-1.314.365-1.199.968-2.25 1.726-3.085.742-.845 1.598-1.477 2.292-2.364.694-1.056.996-2.135 1.079-3.27.048-1.068-.142-2.174-.003-3.247.081-.628.245-1.231.565-1.768a3.29 3.29 0 011.414-1.3c.56-.268 1.224-.393 2.018-.345z" />
    </svg>
  );
}

