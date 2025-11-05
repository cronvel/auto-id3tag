/*
	Auto ID3Tag

	Copyright (c) 2025 Cédric Ronvel

	The MIT License (MIT)

	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:

	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.

	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	SOFTWARE.
*/

"use strict" ;



const cliManager = require( 'utterminal' ).cli ;
const term = require( 'terminal-kit' ).terminal ;

const autoID3TagPackage = require( '../package.json' ) ;
const AutoID3Tag = require( './AutoID3Tag.js' ) ;

const fs = require( 'fs' ) ;



async function cli() {
	/* eslint-disable indent */
	cliManager.package( autoID3TagPackage )
		.app( 'Auto ID3Tag' )
		.description( "Patch ID3 tags from file's name and directories and/or rename MP3 files from ID3 tags." )
		.usage( "[--option1] [--option2] [...]" )
		.introIfTTY
		//.helpOption
		.commonOptions
		.camel
		.commonCommands
		.commandRequired

		.command( 'auto' )
			.usage( "[--option1] [--option2] [...] [directory]" )
			.description( "Patch ID3 tags from file's name and directories and/or rename MP3 files from ID3 tags." )
			.arg( 'directory' ).string
				.typeLabel( 'directory' )
				.description( "The directory to patch, if missing, patch the working directory" )
			.opt( [ 'dry-run' , 'dry' ] ).boolean
				.description( "Dry run, do nothing but display what could be done." )
			.opt( [ 'filesystem-priority' , 'fsp' ] ).boolean
				.description( "If set, tags guessed from filesystem (files and directories names) overwrite existing ID3 tags." )
			.opt( [ 'directory-levels' , 'levels' , 'lvl' ] , 2 ).integer
				.typeLabel( 'integer' )
				.description( "The number of directory levels (default: 2) to use for auto tag, depending on levels, the scheme is: title.mp3 (0), artist/title.mp3 (1), artist/album/title.mp3 (2) or genre/artist/album/title.mp3 (3)." )
			.opt( [ 'input-directory-scheme' , 'ids' ] ).arrayOf.string
				.typeLabel( 'tag' )
				.description( "Describe how parent directories map to tags" )
			.opt( [ 'input-file-name-title-scheme' , 'ifs' ] ).arrayOf.string
				.typeLabel( 'tag' )
				.description( "Describe how the title part of the source (input) filename breaks down (default to only 'title')" )
			.opt( [ 'output-file-name-title-scheme' , 'ofs' ] ).arrayOf.string
				.typeLabel( 'tag' )
				.description( "Describe how the title part of the filename (when renaming) breaks down (default to only 'title')" )
			.opt( [ 'verbose' , 'v' ] ).boolean
				.description( "Output more informations" )
		.command( 'set' )
			.usage( "[--option1] [--option2] [...] [directory]" )
			.description( "Set an ID3 tags for all files in a directory." )
			.arg( 'directory' ).string
				.typeLabel( 'directory' )
				.description( "The directory to patch, if missing, patch the working directory" )
			.opt( [ 'dry-run' , 'dry' ] ).boolean
				.description( "Dry run, do nothing but display what could be done." )
			.opt( [ 'tag' , 't' ] ).string
				.typeLabel( 'tag' )
				.description( "The tag to change." )
			.opt( [ 'content' , 'c' ] ).string
				.typeLabel( 'text' )
				.description( "The tag's content text." )
			.opt( [ 'verbose' , 'v' ] ).boolean
				.description( "Output more informations" ) ;
	/* eslint-enable indent */

	var args = cliManager.run() ;
	//console.log( args ) ;

	switch ( args.command ) {
		case 'auto' :
			return cli.auto( args ) ;
		case 'set' :
			return cli.set( args ) ;
	}
}

module.exports = cli ;



cli.auto = async function( args ) {
	var dirPath = process.cwd() ;

	if ( args.directory ) {
		dirPath = await fs.promises.realpath( args.directory ) ;
	}

	var autoID3Tag = new AutoID3Tag( args ) ;
	autoID3Tag.autoPatchDirectory( dirPath ) ;
} ;



cli.set = async function( args ) {
	var dirPath = process.cwd() ;

	if ( args.directory ) {
		dirPath = await fs.promises.realpath( args.directory ) ;
	}

	var autoID3Tag = new AutoID3Tag( args ) ;
	autoID3Tag.setDirectoryTag( dirPath , args.tag , args.content ) ;
} ;

